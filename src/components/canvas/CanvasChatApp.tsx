import React, { useCallback, useEffect, useRef, useState } from 'react';

import CanvasStage from './CanvasStage';
import CanvasControls from './CanvasControls';
import BranchSelectionBanner from './BranchSelectionBanner';
import ChatSessionsSidebar from './ChatSessionsSidebar';
import { MODELS } from '../../constants/models';
import { useAuth } from '../../contexts/AuthContext';
import { pb } from '../../lib/pocketbaseClient';
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
  const { user } = useAuth();
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
  const [hasLoaded, setHasLoaded] = useState(false);
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

    const defaultNodes = createInitialNodes();

    try {
      const record = await pb.collection('canvas_states').create({
        user: user.id,
        nodes: defaultNodes,
        title: 'New Canvas',
        summary: ''
      });

      const newSession: ChatSession = {
        id: record.id,
        title: record['title'] || 'New Canvas',
        summary: record['summary'] || '',
        updated_at: record.updated,
        created_at: record.created
      };

      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(record.id);
      setNodes(defaultNodes);
      setHasLoaded(true);
      setHasInitiallyCentered(false);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
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
      try {
        const records = await pb.collection('canvas_states').getFullList({
          filter: pb.filter('user = {:userId}', { userId: user.id }),
          sort: '-updated',
          fields: 'id,title,summary,updated,created',
          requestKey: null
        });

        if (records.length > 0) {
          const sessionList: ChatSession[] = records.map((record) => ({
            id: record.id,
            title: record['title'] || 'Untitled Canvas',
            summary: record['summary'] || '',
            updated_at: record.updated,
            created_at: record.created
          }));
          setSessions(sessionList);

          if (!currentSessionId && sessionList.length > 0) {
            setCurrentSessionId(sessionList[0].id);
          }
        } else {
          await createNewSession();
        }
      } catch (error) {
        console.error('Failed to load sessions:', error);
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

    setHasLoaded(false);
    setSyncError(null);
    setLastSavedAt(null);
    setHasInitiallyCentered(false);
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);

    const loadNodes = async () => {
      setIsSyncing(true);
      try {
        const record = await pb.collection('canvas_states').getOne(currentSessionId, { requestKey: null });

        if (!isActive) return;

        const rawNodes = record['nodes'];
        if (Array.isArray(rawNodes)) {
          const storedNodes = rawNodes as StoredCanvasNode[];
          const loadedNodes = storedNodes.map(withNodeDefaults);
          const rootNode = loadedNodes.find((node) => node.id === 'root');

          if (isActive && rootNode) {
            const nodeCenterX = rootNode.x + NODE_WIDTH / 2;
            const nodeHeight = rootNode.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
            const nodeCenterY = rootNode.y + nodeHeight / 2;

            const estimatedCenterX = (window.innerWidth - 264) / 2;
            const estimatedCenterY = window.innerHeight / 2;

            setZoom(1);
            setPanOffset({ x: estimatedCenterX - nodeCenterX, y: estimatedCenterY - nodeCenterY });
            setHasInitiallyCentered(true);
          }

          setNodes(loadedNodes);

          if (isActive && rootNode) {
            const nodeCenterX = rootNode.x + NODE_WIDTH / 2;
            const nodeHeight = rootNode.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
            const nodeCenterY = rootNode.y + nodeHeight / 2;

            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!isActive) {
                  setHasLoaded(true);
                  setIsSyncing(false);
                  return;
                }

                if (canvasRef.current) {
                  const rect = canvasRef.current.getBoundingClientRect();
                  setPanOffset({ x: rect.width / 2 - nodeCenterX, y: rect.height / 2 - nodeCenterY });
                }

                if (isActive) {
                  setHasLoaded(true);
                  setIsSyncing(false);
                }
              });
            });
          } else {
            if (isActive) {
              setHasLoaded(true);
              setIsSyncing(false);
            }
          }
        } else {
          setNodes(createInitialNodes());
          if (isActive) {
            setHasLoaded(true);
            setIsSyncing(false);
          }
        }
      } catch (error) {
        if (!isActive) return;
        setSyncError(error instanceof Error ? error.message : 'Failed to load canvas.');
        setNodes(createInitialNodes());
        setHasLoaded(true);
        setIsSyncing(false);
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

  const generateSessionTitle = (nodes: CanvasNode[]): string => {
    const rootNode = nodes.find((n) => n.id === 'root');
    if (!rootNode) return 'New Canvas';

    const firstUserMessage = rootNode.messages.find((m) => m.role === 'user');
    if (firstUserMessage && firstUserMessage.content.trim()) {
      const content = firstUserMessage.content.trim();
      if (content.length <= 80) return content;
      const truncated = content.substring(0, 77);
      const lastSpace = truncated.lastIndexOf(' ');
      return lastSpace > 50 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    }

    return rootNode.title || 'New Canvas';
  };

  const generateSessionSummary = (nodes: CanvasNode[]): string => {
    const rootNode = nodes.find((n) => n.id === 'root');
    if (!rootNode) return '';
    if (rootNode.summary && rootNode.summary.trim() && rootNode.summary !== 'New conversation') {
      return rootNode.summary;
    }
    return '';
  };

  // Save nodes for the current session
  useEffect(() => {
    if (!user || !hasLoaded || !currentSessionId) {
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

        try {
          await pb.collection('canvas_states').update(currentSessionId, { nodes, title, summary });
        } catch {
          // Record doesn't exist yet, create it
          await pb.collection('canvas_states').create({
            id: currentSessionId,
            user: user.id,
            nodes,
            title,
            summary
          });
        }

        if (!isActive) return;

        setSyncError(null);
        setLastSavedAt(new Date());

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, title, summary, updated_at: new Date().toISOString() }
              : s
          )
        );
      } catch (saveError: unknown) {
        if (!isActive) return;
        setSyncError(
          saveError instanceof Error ? saveError.message : 'Failed to save conversation.'
        );
      } finally {
        if (!isActive) return;
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
  }, [nodes, user, hasLoaded, currentSessionId]);

  useEffect(() => {
    const handleTextSelected = (event: CustomEvent) => {
      const { nodeId, messageIndex, text, range } = event.detail;
      setSelectedText({ nodeId, messageIndex, text, range });
    };

    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as Element;

      if (
        !target.closest('.selectable-message') &&
        !target.closest('.branch-button') &&
        !target.closest('[class*="fixed"]') &&
        !target.closest('form') &&
        !target.closest('input') &&
        !target.closest('button')
      ) {
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
    const rootNode = nodes.find((node) => node.id === 'root');
    if (rootNode && canvasRef.current) {
      setTimeout(() => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const targetZoom = 1;
        const nodeCenterX = rootNode.x + NODE_WIDTH / 2;
        const nodeHeight = rootNode.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
        const nodeCenterY = rootNode.y + nodeHeight / 2;
        const newPanX = centerX / targetZoom - nodeCenterX;
        const newPanY = centerY / targetZoom - nodeCenterY;

        setZoom(targetZoom);
        setPanOffset({ x: newPanX, y: newPanY });
      }, 200);
    }
  }, [nodes]);

  useEffect(() => {
    if (hasLoaded && nodes.length > 0 && !hasInitiallyCentered) {
      setTimeout(() => {
        centerOnRootNode();
        setHasInitiallyCentered(true);
      }, 100);
    }
  }, [hasLoaded, hasInitiallyCentered, centerOnRootNode, nodes]);

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

    if (query && query.trim()) {
      initialMessages.push({ role: 'user', content: query.trim() });
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

    if (query && query.trim()) {
      setIsProcessing((prev) => ({ ...prev, [newNodeId]: true }));

      const contextMessages = buildContextMessages({ nodes: nextNodes, targetNodeId: newNodeId });
      const streamingMessage: Message = { role: 'assistant', content: '' };
      addMessage(newNodeId, streamingMessage);

      let accumulatedContent = '';

      requestAIResponse({
        model: newNode.model,
        messages: contextMessages,
        stream: true,
        onChunk: (chunk: string) => {
          accumulatedContent += chunk;
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id === newNodeId) {
                const updatedMessages = [...n.messages];
                const lastIndex = updatedMessages.length - 1;
                if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
                  updatedMessages[lastIndex] = { ...updatedMessages[lastIndex], content: accumulatedContent };
                }
                return { ...n, messages: updatedMessages };
              }
              return n;
            })
          );
          setTimeout(() => {
            const chatElement = chatScrollRefs.current[newNodeId];
            if (chatElement) chatElement.scrollTop = chatElement.scrollHeight;
          }, 50);
        }
      })
        .then(async (aiContent) => {
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
          const fallbackMessage = error instanceof Error ? error.message : 'Unexpected error.';
          const assistantMessage: Message = { role: 'assistant', content: `Error: ${fallbackMessage}` };
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
      messages: [{ role: 'assistant', content: 'New conversation branch started. What would you like to explore?' }],
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
          return { ...node, children: prunedChildren, childInsights: Object.fromEntries(prunedInsightsEntries) };
        });

      if (parentId) return repositionChildren(filtered, parentId);
      return filtered;
    });
  };

  const sendMessage = async (nodeId: string) => {
    const rawInput = inputValues[nodeId] ?? '';
    const trimmed = rawInput.trim();

    if (!trimmed || isProcessing[nodeId]) return;

    const node = findNode(nodeId);
    if (!node) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    const contextMessages = buildContextMessages({ nodes, targetNodeId: nodeId, upcomingMessages: [userMessage] });

    addMessage(nodeId, userMessage);
    setInputValues((prev) => ({ ...prev, [nodeId]: '' }));
    setIsProcessing((prev) => ({ ...prev, [nodeId]: true }));

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
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id === nodeId) {
                const updatedMessages = [...n.messages];
                const lastIndex = updatedMessages.length - 1;
                if (lastIndex >= 0 && updatedMessages[lastIndex].role === 'assistant') {
                  updatedMessages[lastIndex] = { ...updatedMessages[lastIndex], content: accumulatedContent };
                }
                return { ...n, messages: updatedMessages };
              }
              return n;
            })
          );
          setTimeout(() => {
            const chatElement = chatScrollRefs.current[nodeId];
            if (chatElement) chatElement.scrollTop = chatElement.scrollHeight;
          }, 50);
        }
      });

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
      const fallbackMessage = error instanceof Error ? error.message : 'Unexpected error.';
      const assistantMessage: Message = { role: 'assistant', content: `Error: ${fallbackMessage}` };
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
              if (node.id === draggedNode) return { ...node, x: newX, y: newY };
              if (descendants.includes(node.id)) return { ...node, x: node.x + deltaX, y: node.y + deltaY };
              return node;
            })
          );
        }
      } else if (isPanning) {
        const dx = event.clientX - panStart.x;
        const dy = event.clientY - panStart.y;

        setPanOffset((prev) => ({ x: prev.x + dx / zoom, y: prev.y + dy / zoom }));
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

  const handleCanvasWheel = useCallback(
    (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.chat-scrollable') || target?.closest('textarea')) return;
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(3, zoom * zoomFactor));

      if (newZoom !== zoom) {
        event.preventDefault();

        const worldX = mouseX / zoom - panOffset.x;
        const worldY = mouseY / zoom - panOffset.y;

        setZoom(newZoom);
        setPanOffset({ x: mouseX / newZoom - worldX, y: mouseY / newZoom - worldY });
      }
    },
    [zoom, panOffset.x, panOffset.y]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleCanvasWheel);
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
    if (sessionId === currentSessionId) return;
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
    setHasInitiallyCentered(false);
    setNodes([]);
    setHasLoaded(false);
    setCurrentSessionId(sessionId);
    setInputValues({});
    setIsProcessing({});
    setShowModelSelector({});
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!user) return;

    if (sessions.length <= 1) {
      alert('Cannot delete the last session. Create a new one first.');
      return;
    }

    try {
      await pb.collection('canvas_states').delete(sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
      return;
    }

    setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    if (currentSessionId === sessionId) {
      const remainingSessions = sessions.filter((s) => s.id !== sessionId);
      if (remainingSessions.length > 0) {
        setCurrentSessionId(remainingSessions[0].id);
      } else {
        await createNewSession();
      }
    }
  };

  const handleSignOut = () => {
    pb.authStore.clear();
  };

  const statusText = (() => {
    if (!hasLoaded) return 'Loading conversation…';
    if (isSyncing) return 'Saving…';
    if (lastSavedAt) return `Last saved at ${lastSavedAt.toLocaleTimeString()}`;
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
          <span className="text-sm text-slate-600">{user?.email as string}</span>
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
          {hasLoaded && nodes.length > 0 ? (
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
                setInputValues((prev) => ({ ...prev, [nodeId]: value }))
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
