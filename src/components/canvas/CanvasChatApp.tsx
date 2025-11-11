import React, { useCallback, useEffect, useRef, useState } from 'react';

import CanvasStage from './CanvasStage';
import CanvasControls from './CanvasControls';
import BranchSelectionBanner from './BranchSelectionBanner';
import ChatSessionsSidebar from './ChatSessionsSidebar';
import { MODELS } from '../../constants/models';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { requestAIResponse } from '../../services/aiProvider';
import { buildContextMessages } from '../../services/contextBuilder';
import { generateNodeKnowledge } from '../../services/summaries';
import {
  CanvasNode,
  ChatSession,
  DragOffset,
  Message,
  PanOffset,
  SelectedText
} from '../../types/canvas';
import {
  COLLAPSED_HEIGHT,
  EXPANDED_HEIGHT,
  HORIZONTAL_SPACING,
  NODE_WIDTH,
  VERTICAL_OFFSET,
  calculateChildLayout,
  createBranchTitle
} from '../../utils/canvas';

type StoredCanvasNode = Omit<CanvasNode, 'summary' | 'childInsights' | 'knowledgeUpdatedAt'> & {
  summary?: string;
  childInsights?: Record<string, string>;
  knowledgeUpdatedAt?: string | null;
};

const withNodeDefaults = (node: StoredCanvasNode): CanvasNode => ({
  ...node,
  summary: node.summary ?? '',
  childInsights: node.childInsights ?? {},
  knowledgeUpdatedAt: node.knowledgeUpdatedAt ?? null
});

const createInitialNodes = (): CanvasNode[] => [
  {
    id: 'root',
    x: 400,
    y: 100,
    messages: [
      {
        role: 'assistant',
        content:
          "Hello! I'm ready to help you explore ideas through branching conversations. What would you like to discuss?"
      }
    ],
    children: [],
    parent: null,
    isActive: true,
    title: 'Main Thread',
    isExpanded: true,
    model: 'claude-3-5-sonnet-latest',
    summary: '',
    childInsights: {},
    knowledgeUpdatedAt: null
  }
];

const collectDescendants = (nodes: CanvasNode[], nodeId: string): string[] => {
  const descendants: string[] = [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));

  const traverse = (currentId: string) => {
    const current = nodeMap.get(currentId);
    if (!current) return;
    current.children.forEach((childId) => {
      descendants.push(childId);
      traverse(childId);
    });
  };

  traverse(nodeId);
  return descendants;
};

const repositionChildren = (nodes: CanvasNode[], parentId: string): CanvasNode[] => {
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent || parent.children.length === 0) {
    return nodes;
  }

  const { startX, y } = calculateChildLayout(parent, parent.children.length);
  return nodes.map((node) => {
    const index = parent.children.indexOf(node.id);
    if (index === -1) {
      return node;
    }
    return {
      ...node,
      x: startX + index * (NODE_WIDTH + HORIZONTAL_SPACING),
      y
    };
  });
};

const CanvasChatApp: React.FC = () => {
  const { user } = useSupabaseAuth();
  const [nodes, setNodes] = useState<CanvasNode[]>(createInitialNodes);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [selectedText, setSelectedText] = useState<SelectedText>({});
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [showModelSelector, setShowModelSelector] = useState<Record<string, boolean>>({});
  const [hasLoadedFromSupabase, setHasLoadedFromSupabase] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasInitiallyCentered, setHasInitiallyCentered] = useState(false);

  const canvasRef = useRef<SVGSVGElement>(null);
  const chatScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const findNode = useCallback(
    (nodeId: string) => nodes.find((node) => node.id === nodeId),
    [nodes]
  );

  const addMessage = useCallback((nodeId: string, message: Message) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId ? { ...node, messages: [...node.messages, message] } : node
      )
    );

    setTimeout(() => {
      const chatElement = chatScrollRefs.current[nodeId];
      if (chatElement) {
        chatElement.scrollTop = chatElement.scrollHeight;
      }
    }, 100);
  }, []);

  const refreshNodeKnowledge = useCallback(
    async (nodeId: string, conversation: Message[], nodeTitle: string) => {
      try {
        const knowledge = await generateNodeKnowledge(conversation, nodeTitle);
        if (!knowledge) {
          return;
        }

        const knowledgeUpdatedAt = new Date().toISOString();
        const trimmedSummary = knowledge.summary.trim();
        const trimmedParentInsights = knowledge.parentInsights.trim();

        setNodes((prev) => {
          const nodeMap = new Map(prev.map((node) => [node.id, node] as const));
          const nextNodes = prev.map((node) => ({
            ...node,
            childInsights: { ...node.childInsights }
          }));
          const indexById = new Map(nextNodes.map((node, index) => [node.id, index] as const));

          const targetIndex = indexById.get(nodeId);
          if (targetIndex === undefined) {
            return prev;
          }

          const existingSummary = nextNodes[targetIndex].summary;
          const summaryToApply = trimmedSummary || existingSummary;
          const shouldStampUpdate = Boolean(trimmedSummary || trimmedParentInsights);

          nextNodes[targetIndex] = {
            ...nextNodes[targetIndex],
            summary: summaryToApply,
            knowledgeUpdatedAt: shouldStampUpdate
              ? knowledgeUpdatedAt
              : nextNodes[targetIndex].knowledgeUpdatedAt
          };

          let currentNodeId = nodeId;
          let propagatedInsight = trimmedParentInsights || summaryToApply;

          while (true) {
            const parentId = nodeMap.get(currentNodeId)?.parent;
            if (!parentId) {
              break;
            }

            const parentIndex = indexById.get(parentId);
            if (parentIndex === undefined) {
              break;
            }

            const childTitle = nodeMap.get(currentNodeId)?.title ?? 'Branch';
            const parentNode = nextNodes[parentIndex];
            const previousInsight = parentNode.childInsights[currentNodeId] ?? '';
            const formattedInsight = propagatedInsight
              ? `${childTitle}: ${propagatedInsight}`
              : previousInsight;

            const updatedInsights = { ...parentNode.childInsights };

            if (formattedInsight) {
              updatedInsights[currentNodeId] = formattedInsight;
            } else {
              delete updatedInsights[currentNodeId];
            }

            nextNodes[parentIndex] = {
              ...parentNode,
              childInsights: updatedInsights
            };

            propagatedInsight = formattedInsight;
            currentNodeId = parentId;
          }

          return nextNodes;
        });
      } catch (error) {
        console.error('Failed to refresh node knowledge', error);
      }
    },
    [generateNodeKnowledge, setNodes]
  );

  const updateNodeModel = (nodeId: string, modelId: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, model: modelId } : node))
    );
    setShowModelSelector((prev) => ({ ...prev, [nodeId]: false }));
  };

  const toggleNodeExpansion = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, isExpanded: !node.isExpanded } : node))
    );
  };


  const createNewSession = async () => {
    if (!user) return;

    const newSessionId = crypto.randomUUID();
    const defaultNodes = createInitialNodes();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('canvas_states')
      .insert({
        id: newSessionId,
        user_id: user.id,
        nodes: defaultNodes,
        title: 'New Canvas',
        summary: '',
        created_at: now,
        updated_at: now
      })
      .select('id, title, summary, updated_at, created_at')
      .single();

    if (error) {
      console.error('Failed to create session:', error);
      return;
    }

    const newSession: ChatSession = {
      id: data.id,
      title: data.title || 'New Canvas',
      summary: data.summary || '',
      updated_at: data.updated_at,
      created_at: data.created_at || data.updated_at
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSessionId);
    setNodes(defaultNodes);
    setHasLoadedFromSupabase(true);
    setHasInitiallyCentered(false);
  };

  // Load all sessions for the user
  useEffect(() => {
    if (!user) {
      setSessions([]);
      setCurrentSessionId(null);
      setNodes(createInitialNodes());
      return;
    }

    const loadSessions = async () => {
      const { data, error } = await supabase
        .from('canvas_states')
        .select('id, title, summary, updated_at, created_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Failed to load sessions:', error);
        return;
      }

      if (data && data.length > 0) {
        const sessionList: ChatSession[] = data.map((row) => ({
          id: row.id,
          title: row.title || 'Untitled Canvas',
          summary: row.summary || '',
          updated_at: row.updated_at,
          created_at: row.created_at || row.updated_at
        }));
        setSessions(sessionList);
        
        // Load the most recent session if no current session is set
        if (!currentSessionId && sessionList.length > 0) {
          setCurrentSessionId(sessionList[0].id);
        }
      } else {
        // No sessions exist, create a default one
        await createNewSession();
      }
    };

    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load nodes for the current session
  useEffect(() => {
    if (!user || !currentSessionId) {
      return;
    }

    let isActive = true;

    // Reset state before loading
    setHasLoadedFromSupabase(false);
    setSyncError(null);
    setLastSavedAt(null);
    setHasInitiallyCentered(false);
    // Reset canvas position immediately to prevent showing old position
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);

    const loadNodes = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase
        .from('canvas_states')
        .select('nodes')
        .eq('id', currentSessionId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (error) {
        setSyncError(error.message);
        const defaultNodes = createInitialNodes();
        setNodes(defaultNodes);
        if (isActive) {
          setHasLoadedFromSupabase(true);
          setIsSyncing(false);
        }
      } else if (Array.isArray(data?.nodes)) {
        const storedNodes = data.nodes as StoredCanvasNode[];
        const loadedNodes = storedNodes.map(withNodeDefaults);
        const rootNode = loadedNodes.find(node => node.id === 'root');
        
        // Calculate center position FIRST using window dimensions as estimate
        // This ensures pan/zoom is set before nodes render
        if (isActive && rootNode) {
          const nodeCenterX = rootNode.x + NODE_WIDTH / 2;
          const nodeHeight = rootNode.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
          const nodeCenterY = rootNode.y + nodeHeight / 2;
          
          // Use window dimensions as initial estimate (canvas typically fills most of viewport)
          // Account for sidebar (264px) and header
          const estimatedCenterX = (window.innerWidth - 264) / 2;
          const estimatedCenterY = window.innerHeight / 2;
          
          // Set pan/zoom immediately with estimate
          setZoom(1);
          setPanOffset({ x: estimatedCenterX - nodeCenterX, y: estimatedCenterY - nodeCenterY });
          setHasInitiallyCentered(true);
        }
        
        // Set nodes - they'll render at the estimated centered position
        setNodes(loadedNodes);
        
        // Fine-tune centering after canvas renders
        if (isActive && rootNode) {
          const nodeCenterX = rootNode.x + NODE_WIDTH / 2;
          const nodeHeight = rootNode.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
          const nodeCenterY = rootNode.y + nodeHeight / 2;
          
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!isActive) {
                setHasLoadedFromSupabase(true);
                setIsSyncing(false);
                return;
              }
              
              if (canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                const actualCenterX = rect.width / 2;
                const actualCenterY = rect.height / 2;
                
                // Fine-tune if significantly different
                setPanOffset({ x: actualCenterX - nodeCenterX, y: actualCenterY - nodeCenterY });
              }
              
              // Mark as loaded AFTER fine-tuning
              if (isActive) {
                setHasLoadedFromSupabase(true);
                setIsSyncing(false);
              }
            });
          });
        } else {
          // If no root node, just mark as loaded
          if (isActive) {
            setHasLoadedFromSupabase(true);
            setIsSyncing(false);
          }
        }
      } else {
        const defaultNodes = createInitialNodes();
        setNodes(defaultNodes);
        if (isActive) {
          setHasLoadedFromSupabase(true);
          setIsSyncing(false);
        }
      }
    };

    loadNodes();

    return () => {
      isActive = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [user, currentSessionId]);

  // Generate session title from root node (simple, max 80 chars)
  const generateSessionTitle = (nodes: CanvasNode[]): string => {
    const rootNode = nodes.find((n) => n.id === 'root');
    if (!rootNode) return 'New Canvas';
    
    // Look for the first user message as the title
    const firstUserMessage = rootNode.messages.find((m) => m.role === 'user');
    if (firstUserMessage && firstUserMessage.content.trim()) {
      const content = firstUserMessage.content.trim();
      // Return a simple title (max 80 chars)
      if (content.length <= 80) {
        return content;
      }
      // Truncate at word boundary if possible
      const truncated = content.substring(0, 77);
      const lastSpace = truncated.lastIndexOf(' ');
      return lastSpace > 50 
        ? truncated.substring(0, lastSpace) + '...'
        : truncated + '...';
    }
    
    // Fallback to root node title or default
    return rootNode.title || 'New Canvas';
  };

  // Generate session summary for detailed view (can be longer)
  const generateSessionSummary = (nodes: CanvasNode[]): string => {
    const rootNode = nodes.find((n) => n.id === 'root');
    if (!rootNode) return '';
    
    // Use the summary if available and meaningful
    if (rootNode.summary && rootNode.summary.trim() && rootNode.summary !== 'New conversation') {
      return rootNode.summary;
    }
    
    return '';
  };

  // Save nodes for the current session
  useEffect(() => {
    if (!user || !hasLoadedFromSupabase || !currentSessionId) {
      return;
    }

    let isActive = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const title = generateSessionTitle(nodes);
        const summary = generateSessionSummary(nodes);

        const { error } = await supabase
          .from('canvas_states')
          .upsert(
            {
              id: currentSessionId,
              user_id: user.id,
              nodes,
              title,
              summary,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
          );

        if (!isActive) {
          return;
        }

        if (error) {
          setSyncError(error.message);
        } else {
          setSyncError(null);
          setLastSavedAt(new Date());
          
          // Update sessions list with new summary/title
          setSessions((prev) =>
            prev.map((s) =>
              s.id === currentSessionId
                ? { ...s, title, summary, updated_at: new Date().toISOString() }
                : s
            )
          );
        }
      } catch (saveError: unknown) {
        if (!isActive) {
          return;
        }
        setSyncError(
          saveError instanceof Error ? saveError.message : 'Failed to save conversation.'
        );
      } finally {
        if (!isActive) {
          return;
        }
        setIsSyncing(false);
        saveTimeoutRef.current = null;
      }
    }, 600);

    return () => {
      isActive = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [nodes, user, hasLoadedFromSupabase, currentSessionId]);

  useEffect(() => {
    const handleTextSelected = (event: CustomEvent) => {
      const { nodeId, messageIndex, text, range } = event.detail;
      setSelectedText({
        nodeId,
        messageIndex,
        text,
        range
      });
    };

    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Only clear selection if clicking outside of messages and not on banner elements
      if (!target.closest('.selectable-message') && 
          !target.closest('.branch-button') && 
          !target.closest('[class*="fixed"]') &&
          !target.closest('form') &&
          !target.closest('input') &&
          !target.closest('button')) {
        setSelectedText({});
      }
      
      if (!target.closest('.model-selector')) {
        setShowModelSelector({});
      }
    };

    document.addEventListener('textSelected', handleTextSelected as EventListener);
    document.addEventListener('click', handleGlobalClick);

    return () => {
      document.removeEventListener('textSelected', handleTextSelected as EventListener);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  const centerOnRootNode = useCallback(() => {
    const rootNode = nodes.find(node => node.id === 'root');
    if (rootNode && canvasRef.current) {
      // Wait a bit for the canvas to be fully rendered
      setTimeout(() => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        // Calculate pan offset to center the root node
        // Transform is: translate(panOffset.x * zoom, panOffset.y * zoom) scale(zoom)
        // So screen position = (worldX + panOffset.x) * zoom
        // To center the node's center: centerX = (rootNode.x + NODE_WIDTH/2 + panOffset.x) * zoom
        // Solving: panOffset.x = (centerX / zoom) - rootNode.x - NODE_WIDTH/2
        const targetZoom = 1;
        const nodeCenterX = rootNode.x + NODE_WIDTH / 2;
        // For Y, center on the node's vertical center
        const nodeHeight = rootNode.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
        const nodeCenterY = rootNode.y + nodeHeight / 2;
        const newPanX = (centerX / targetZoom) - nodeCenterX;
        const newPanY = (centerY / targetZoom) - nodeCenterY;
        
        // Set zoom first, then pan offset
        setZoom(targetZoom);
        setPanOffset({ x: newPanX, y: newPanY });
      }, 200);
    }
  }, [nodes]);

  // Center on root node only if not already centered during load
  useEffect(() => {
    if (hasLoadedFromSupabase && nodes.length > 0 && !hasInitiallyCentered) {
      // Fallback centering if it wasn't done during load
      setTimeout(() => {
        centerOnRootNode();
        setHasInitiallyCentered(true);
      }, 100);
    }
  }, [hasLoadedFromSupabase, hasInitiallyCentered, centerOnRootNode, nodes]);


  const createBranchFromText = (parentId: string, selectedContent: string, query?: string) => {
    const parent = findNode(parentId);
    if (!parent) return;

    const newNodeId = `node-${Date.now()}`;
    const branchTitle = createBranchTitle(selectedContent);

    const contextMessage: Message = {
      role: 'system',
      content: `Exploring: "${selectedContent}"`
    };

    const initialMessages: Message[] = [contextMessage];
    
    // If there's a query, add it as a user message
    if (query && query.trim()) {
      initialMessages.push({
        role: 'user',
        content: query.trim()
      });
    }

    const newNode: CanvasNode = {
      id: newNodeId,
      x: parent.x,
      y: parent.y + VERTICAL_OFFSET,
      messages: initialMessages,
      children: [],
      parent: parentId,
      isActive: true,
      title: branchTitle,
      isExpanded: true,
      model: parent.model,
      summary: '',
      childInsights: {},
      knowledgeUpdatedAt: null
    };

    let generatedNodes: CanvasNode[] = [];
    setNodes((prev) => {
      const updatedParent = prev.map((node) =>
        node.id === parentId ? { ...node, children: [...node.children, newNodeId] } : node
      );
      const withNewNode = [...updatedParent, newNode];
      const repositioned = repositionChildren(withNewNode, parentId);
      generatedNodes = repositioned;
      return repositioned;
    });

    setSelectedText({});
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }

    const nextNodes = generatedNodes.length ? generatedNodes : nodes;

    // If there's a query, automatically send it to get an AI response
    if (query && query.trim()) {
      setIsProcessing((prev) => ({ ...prev, [newNodeId]: true }));

      const contextMessages = buildContextMessages({
        nodes: nextNodes,
        targetNodeId: newNodeId
      });

      // Create a streaming assistant message
      const streamingMessage: Message = { role: 'assistant', content: '' };
      addMessage(newNodeId, streamingMessage);

      let accumulatedContent = '';

      requestAIResponse({
        model: newNode.model,
        messages: contextMessages,
        stream: true,
        onChunk: (chunk: string) => {
          accumulatedContent += chunk;
          // Update the last message (the streaming one) with accumulated content
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id === newNodeId) {
                const updatedMessages = [...n.messages];
                const lastIndex = updatedMessages.length - 1;
                if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
                  updatedMessages[lastIndex] = {
                    ...updatedMessages[lastIndex],
                    content: accumulatedContent
                  };
                }
                return { ...n, messages: updatedMessages };
              }
              return n;
            })
          );

          // Auto-scroll to bottom as content streams
          setTimeout(() => {
            const chatElement = chatScrollRefs.current[newNodeId];
            if (chatElement) {
              chatElement.scrollTop = chatElement.scrollHeight;
            }
          }, 50);
        }
      })
        .then(async (aiContent) => {
          // Final update with complete content
          const assistantMessage: Message = { role: 'assistant', content: aiContent };
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id === newNodeId) {
                const updatedMessages = [...n.messages];
                const lastIndex = updatedMessages.length - 1;
                if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
                  updatedMessages[lastIndex] = assistantMessage;
                }
                return { ...n, messages: updatedMessages };
              }
              return n;
            })
          );
          const fullConversation = [...initialMessages, assistantMessage];
          await refreshNodeKnowledge(newNodeId, fullConversation, newNode.title);
        })
        .catch((error) => {
          console.error('AI response error', error);
          const fallbackMessage =
            error instanceof Error ? error.message : 'Unexpected error while generating a response.';
          const assistantMessage: Message = {
            role: 'assistant',
            content: `Error: ${fallbackMessage}`
          };
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id === newNodeId) {
                const updatedMessages = [...n.messages];
                const lastIndex = updatedMessages.length - 1;
                if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
                  updatedMessages[lastIndex] = assistantMessage;
                }
                return { ...n, messages: updatedMessages };
              }
              return n;
            })
          );
        })
        .finally(() => {
          setIsProcessing((prev) => ({ ...prev, [newNodeId]: false }));
        });
    }
  };

  const createBranch = (parentId: string) => {
    const parent = findNode(parentId);
    if (!parent) return;

    const newNodeId = `node-${Date.now()}`;
    const branchNumber = parent.children.length + 1;

    const newNode: CanvasNode = {
      id: newNodeId,
      x: parent.x,
      y: parent.y + VERTICAL_OFFSET,
      messages: [
        { role: 'assistant', content: 'New conversation branch started. What would you like to explore?' }
      ],
      children: [],
      parent: parentId,
      isActive: true,
      title: `Branch ${branchNumber}`,
      isExpanded: true,
      model: parent.model,
      summary: '',
      childInsights: {},
      knowledgeUpdatedAt: null
    };

    setNodes((prev) => {
      const updatedParent = prev.map((node) =>
        node.id === parentId ? { ...node, children: [...node.children, newNodeId] } : node
      );
      const withNewNode = [...updatedParent, newNode];
      return repositionChildren(withNewNode, parentId);
    });
  };

  const deleteNode = (nodeId: string) => {
    if (nodeId === 'root') return;

    const nodeToDelete = findNode(nodeId);
    if (!nodeToDelete) return;

    const parentId = nodeToDelete.parent;

    setNodes((prev) => {
      const descendants = new Set(collectDescendants(prev, nodeId));
      const idsToRemove = new Set<string>([nodeId, ...descendants]);
      const filtered = prev
        .filter((node) => !idsToRemove.has(node.id))
        .map((node) => {
          const prunedChildren = node.children.filter((childId) => !idsToRemove.has(childId));
          const prunedInsightsEntries = Object.entries(node.childInsights).filter(
            ([childId]) => !idsToRemove.has(childId)
          );

          return {
            ...node,
            children: prunedChildren,
            childInsights: Object.fromEntries(prunedInsightsEntries)
          };
        });

      if (parentId) {
        return repositionChildren(filtered, parentId);
      }

      return filtered;
    });
  };

  const sendMessage = async (nodeId: string) => {
    const rawInput = inputValues[nodeId] ?? '';
    const trimmed = rawInput.trim();

    if (!trimmed || isProcessing[nodeId]) {
      return;
    }

    const node = findNode(nodeId);
    if (!node) {
      return;
    }

    const userMessage: Message = { role: 'user', content: trimmed };
    const contextMessages = buildContextMessages({
      nodes,
      targetNodeId: nodeId,
      upcomingMessages: [userMessage]
    });

    addMessage(nodeId, userMessage);

    setInputValues((prev) => ({ ...prev, [nodeId]: '' }));
    setIsProcessing((prev) => ({ ...prev, [nodeId]: true }));

    // Create a streaming assistant message
    const streamingMessage: Message = { role: 'assistant', content: '' };
    addMessage(nodeId, streamingMessage);

    let accumulatedContent = '';

    try {
      const aiContent = await requestAIResponse({
        model: node.model,
        messages: contextMessages,
        stream: true,
        onChunk: (chunk: string) => {
          accumulatedContent += chunk;
          // Update the last message (the streaming one) with accumulated content
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id === nodeId) {
                const updatedMessages = [...n.messages];
                const lastIndex = updatedMessages.length - 1;
                if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
                  updatedMessages[lastIndex] = {
                    ...updatedMessages[lastIndex],
                    content: accumulatedContent
                  };
                }
                return { ...n, messages: updatedMessages };
              }
              return n;
            })
          );

          // Auto-scroll to bottom as content streams
          setTimeout(() => {
            const chatElement = chatScrollRefs.current[nodeId];
            if (chatElement) {
              chatElement.scrollTop = chatElement.scrollHeight;
            }
          }, 50);
        }
      });

      // Final update with complete content
      const assistantMessage: Message = { role: 'assistant', content: aiContent };
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === nodeId) {
            const updatedMessages = [...n.messages];
            const lastIndex = updatedMessages.length - 1;
            if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
              updatedMessages[lastIndex] = assistantMessage;
            }
            return { ...n, messages: updatedMessages };
          }
          return n;
        })
      );

      const fullConversation = [...node.messages, userMessage, assistantMessage];
      await refreshNodeKnowledge(nodeId, fullConversation, node.title);
    } catch (error) {
      console.error('AI response error', error);
      const fallbackMessage =
        error instanceof Error ? error.message : 'Unexpected error while generating a response.';
      const assistantMessage: Message = {
        role: 'assistant',
        content: `Error: ${fallbackMessage}`
      };
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === nodeId) {
            const updatedMessages = [...n.messages];
            const lastIndex = updatedMessages.length - 1;
            if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
              updatedMessages[lastIndex] = assistantMessage;
            }
            return { ...n, messages: updatedMessages };
          }
          return n;
        })
      );
    } finally {
      setIsProcessing((prev) => ({ ...prev, [nodeId]: false }));
    }
  };

  const handleMouseDown = (event: React.MouseEvent<SVGForeignObjectElement, MouseEvent>, nodeId: string) => {
    const target = event.target as Element;
    if (
      target.closest('.chat-content') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('button') ||
      target.closest('.model-selector')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const node = findNode(nodeId);
    if (!node || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    setDraggedNode(nodeId);
    setDragOffset({
      x: (event.clientX - rect.left) / zoom - panOffset.x - node.x,
      y: (event.clientY - rect.top) / zoom - panOffset.y - node.y
    });
  };

  const handleCanvasMouseDown = (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (
      event.target === canvasRef.current ||
      (event.target as Element).tagName === 'rect' ||
      (event.target as Element).tagName === 'path'
    ) {
      setIsPanning(true);
      setPanStart({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (draggedNode && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const newX = (event.clientX - rect.left) / zoom - panOffset.x - dragOffset.x;
        const newY = (event.clientY - rect.top) / zoom - panOffset.y - dragOffset.y;

        const currentNode = nodes.find((node) => node.id === draggedNode);
        if (currentNode) {
          const deltaX = newX - currentNode.x;
          const deltaY = newY - currentNode.y;
          const descendants = collectDescendants(nodes, draggedNode);

          setNodes((prev) =>
            prev.map((node) => {
              if (node.id === draggedNode) {
                return { ...node, x: newX, y: newY };
              }
              if (descendants.includes(node.id)) {
                return { ...node, x: node.x + deltaX, y: node.y + deltaY };
              }
              return node;
            })
          );
        }
      } else if (isPanning) {
        const dx = event.clientX - panStart.x;
        const dy = event.clientY - panStart.y;

        setPanOffset((prev) => ({
          x: prev.x + dx / zoom,
          y: prev.y + dy / zoom
        }));

        setPanStart({ x: event.clientX, y: event.clientY });
      }
    },
    [draggedNode, dragOffset, isPanning, panOffset.x, panOffset.y, panStart.x, panStart.y, nodes, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setDraggedNode(null);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleCanvasWheel = useCallback((event: WheelEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.chat-scrollable') || target?.closest('textarea')) {
      return;
    }

    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.2, Math.min(3, zoom * zoomFactor));

    if (newZoom !== zoom) {
      event.preventDefault();
      
      // Calculate the point under the mouse cursor in world coordinates
      const worldX = (mouseX / zoom) - panOffset.x;
      const worldY = (mouseY / zoom) - panOffset.y;

      // Calculate new pan offset to keep the same point under the mouse
      const newPanX = (mouseX / newZoom) - worldX;
      const newPanY = (mouseY / newZoom) - worldY;

      setZoom(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    }
  }, [zoom, panOffset.x, panOffset.y]);

  // Add wheel event listener directly to canvas with passive: false
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
      return () => {
        canvas.removeEventListener('wheel', handleCanvasWheel);
      };
    }
  }, [handleCanvasWheel]);

  const toggleModelSelector = (nodeId: string) => {
    setShowModelSelector((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleBranchFromBanner = (query?: string) => {
    if (selectedText.nodeId && selectedText.text) {
      createBranchFromText(selectedText.nodeId, selectedText.text, query);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    // Reset canvas state FIRST, before clearing nodes
    // This prevents showing the old canvas position
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
    setHasInitiallyCentered(false);
    
    // Clear nodes immediately to prevent flashing
    setNodes([]);
    setHasLoadedFromSupabase(false);
    setCurrentSessionId(sessionId);
    
    // Clear input values and processing states
    setInputValues({});
    setIsProcessing({});
    setShowModelSelector({});
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!user) return;

    // Don't delete if it's the only session
    if (sessions.length <= 1) {
      alert('Cannot delete the last session. Create a new one first.');
      return;
    }

    const { error } = await supabase
      .from('canvas_states')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to delete session:', error);
      return;
    }

    // Remove from sessions list
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    // If we deleted the current session, switch to the first remaining one
    if (currentSessionId === sessionId) {
      const remainingSessions = sessions.filter((s) => s.id !== sessionId);
      if (remainingSessions.length > 0) {
        setCurrentSessionId(remainingSessions[0].id);
      } else {
        // Create a new session if none remain
        await createNewSession();
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const statusText = (() => {
    if (!hasLoadedFromSupabase) {
      return 'Loading conversation…';
    }
    if (isSyncing) {
      return 'Saving…';
    }
    if (lastSavedAt) {
      return `Last saved at ${lastSavedAt.toLocaleTimeString()}`;
    }
    return 'All changes saved';
  })();

  const statusMessage = syncError ? `Save failed: ${syncError}` : statusText;
  const statusClass = syncError ? 'text-rose-600' : 'text-slate-500';

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shadow-sm z-10">
        <div>
          <span className="block text-xl font-semibold text-slate-900">Canvas GPT</span>
          <span className={`block text-sm ${statusClass}`}>{statusMessage}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{user?.email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {user && (
          <ChatSessionsSidebar
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onCreateSession={createNewSession}
            onDeleteSession={handleDeleteSession}
          />
        )}
        <div className="relative flex-1 overflow-hidden">
          {hasLoadedFromSupabase && nodes.length > 0 ? (
            <CanvasStage
              nodes={nodes}
              models={MODELS}
              zoom={zoom}
              panOffset={panOffset}
              isPanning={isPanning}
              canvasRef={canvasRef}
              chatScrollRefs={chatScrollRefs}
              inputValues={inputValues}
              isProcessing={isProcessing}
              showModelSelector={showModelSelector}
              onCanvasMouseDown={handleCanvasMouseDown}
              onNodeMouseDown={handleMouseDown}
              onToggleNodeExpansion={toggleNodeExpansion}
              onCreateBranch={createBranch}
              onDeleteNode={deleteNode}
              onToggleModelSelector={toggleModelSelector}
              onUpdateModel={updateNodeModel}
              onInputChange={(nodeId, value) =>
                setInputValues((prev) => ({
                  ...prev,
                  [nodeId]: value
                }))
              }
              onSendMessage={sendMessage}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-slate-500">Loading canvas...</div>
            </div>
          )}

        <CanvasControls
          zoom={zoom}
          onZoomIn={() => setZoom((prev) => Math.min(prev * 1.2, 3))}
          onZoomOut={() => setZoom((prev) => Math.max(prev / 1.2, 0.3))}
        />

          <BranchSelectionBanner selectedText={selectedText} onCreateBranch={handleBranchFromBanner} />
        </div>
      </div>
    </div>
  );
};

export default CanvasChatApp;
