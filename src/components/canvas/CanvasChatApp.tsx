import React, { useCallback, useEffect, useRef, useState } from 'react';

import CanvasStage from './CanvasStage';
import CanvasControls from './CanvasControls';
import BranchSelectionBanner from './BranchSelectionBanner';
import { MODELS } from '../../constants/models';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { supabase } from '../../lib/supabaseClient';
import { requestAIResponse } from '../../services/aiProvider';
import {
  CanvasNode,
  DragOffset,
  Message,
  PanOffset,
  SelectedText
} from '../../types/canvas';
import {
  HORIZONTAL_SPACING,
  NODE_WIDTH,
  VERTICAL_OFFSET,
  calculateChildLayout,
  createBranchTitle
} from '../../utils/canvas';

type StoredCanvasNode = Omit<CanvasNode, 'systemPrompt' | 'context'> & {
  systemPrompt?: string;
  context?: string;
};

const withNodeDefaults = (node: StoredCanvasNode): CanvasNode => ({
  ...node,
  systemPrompt: node.systemPrompt ?? '',
  context: node.context ?? ''
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
    systemPrompt: '',
    context: ''
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

  const updateNodeModel = (nodeId: string, modelId: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, model: modelId } : node))
    );
    setShowModelSelector((prev) => ({ ...prev, [nodeId]: false }));
  };

  const updateNodeSystemPrompt = (nodeId: string, prompt: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, systemPrompt: prompt } : node))
    );
  };

  const updateNodeContext = (nodeId: string, value: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, context: value } : node))
    );
  };

  const toggleNodeExpansion = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, isExpanded: !node.isExpanded } : node))
    );
  };


  useEffect(() => {
    let isActive = true;

    setHasLoadedFromSupabase(false);
    setSyncError(null);
    setLastSavedAt(null);

    if (!user) {
      setNodes(createInitialNodes());
      setIsSyncing(false);
      return;
    }

    const loadNodes = async () => {
      setIsSyncing(true);
      const { data, error } = await supabase
        .from('canvas_states')
        .select('nodes')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (error) {
        setSyncError(error.message);
        setNodes(createInitialNodes());
      } else if (Array.isArray(data?.nodes)) {
        const storedNodes = data.nodes as StoredCanvasNode[];
        setNodes(storedNodes.map(withNodeDefaults));
      } else {
        const defaultNodes = createInitialNodes();
        setNodes(defaultNodes);
        const { error: upsertError } = await supabase
          .from('canvas_states')
          .upsert(
            { user_id: user.id, nodes: defaultNodes, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (upsertError) {
          setSyncError(upsertError.message);
        }
      }

      if (isActive) {
        setHasLoadedFromSupabase(true);
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
  }, [user]);

  useEffect(() => {
    if (!user || !hasLoadedFromSupabase) {
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
        const { error } = await supabase
          .from('canvas_states')
          .upsert(
            { user_id: user.id, nodes, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );

        if (!isActive) {
          return;
        }

        if (error) {
          setSyncError(error.message);
        } else {
          setSyncError(null);
          setLastSavedAt(new Date());
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
  }, [nodes, user, hasLoadedFromSupabase]);

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
      systemPrompt: parent.systemPrompt,
      context: parent.context
    };

    setNodes((prev) => {
      const updatedParent = prev.map((node) =>
        node.id === parentId ? { ...node, children: [...node.children, newNodeId] } : node
      );
      const withNewNode = [...updatedParent, newNode];
      return repositionChildren(withNewNode, parentId);
    });

    setSelectedText({});
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }

    // If there's a query, automatically send it to get an AI response
    if (query && query.trim()) {
      // Set processing state for the new node
      setIsProcessing((prev) => ({ ...prev, [newNodeId]: true }));

      // Prepare the conversation for AI response
      const systemMessages: Message[] = [];
      if (newNode.systemPrompt.trim()) {
        systemMessages.push({ role: 'system', content: newNode.systemPrompt.trim() });
      }
      if (newNode.context.trim()) {
        systemMessages.push({ role: 'system', content: newNode.context.trim() });
      }

      const conversation = [...systemMessages, ...newNode.messages];

      // Send the query to AI
      requestAIResponse({
        model: newNode.model,
        messages: conversation
      })
        .then((aiContent) => {
          addMessage(newNodeId, { role: 'assistant', content: aiContent });
        })
        .catch((error) => {
          console.error('AI response error', error);
          const fallbackMessage =
            error instanceof Error ? error.message : 'Unexpected error while generating a response.';
          addMessage(newNodeId, { role: 'assistant', content: `Error: ${fallbackMessage}` });
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
      systemPrompt: parent.systemPrompt,
      context: parent.context
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
      const filtered = prev
        .filter((node) => node.id !== nodeId && !descendants.has(node.id))
        .map((node) =>
          node.children.includes(nodeId)
            ? { ...node, children: node.children.filter((childId) => childId !== nodeId) }
            : node
        );

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
    const systemMessages: Message[] = [];

    if (node.systemPrompt.trim()) {
      systemMessages.push({ role: 'system', content: node.systemPrompt.trim() });
    }

    if (node.context.trim()) {
      systemMessages.push({ role: 'system', content: node.context.trim() });
    }

    const conversation = [...systemMessages, ...node.messages, userMessage];

    addMessage(nodeId, userMessage);

    setInputValues((prev) => ({ ...prev, [nodeId]: '' }));
    setIsProcessing((prev) => ({ ...prev, [nodeId]: true }));

    try {
      const aiContent = await requestAIResponse({
        model: node.model,
        messages: conversation
      });
      addMessage(nodeId, { role: 'assistant', content: aiContent });
    } catch (error) {
      console.error('AI response error', error);
      const fallbackMessage =
        error instanceof Error ? error.message : 'Unexpected error while generating a response.';
      addMessage(nodeId, { role: 'assistant', content: `Error: ${fallbackMessage}` });
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

  const handleCanvasWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.chat-scrollable') || target?.closest('textarea')) {
      return;
    }

    // event.preventDefault();
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) / zoom - panOffset.x;
    const mouseY = (event.clientY - rect.top) / zoom - panOffset.y;

    const zoomFactor = event.deltaY > 0 ? 0.97 : 1.03;
    const newZoom = Math.max(0.2, Math.min(3, zoom * zoomFactor));

    if (newZoom !== zoom) {
      const newPanX = panOffset.x - (mouseX * (newZoom - zoom)) / newZoom;
      const newPanY = panOffset.y - (mouseY * (newZoom - zoom)) / newZoom;

      setZoom(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    }
  };

  const toggleModelSelector = (nodeId: string) => {
    setShowModelSelector((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleBranchFromBanner = (query?: string) => {
    if (selectedText.nodeId && selectedText.text) {
      createBranchFromText(selectedText.nodeId, selectedText.text, query);
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

      <div className="relative flex-1 overflow-hidden">
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
          onCanvasWheel={handleCanvasWheel}
          onNodeMouseDown={handleMouseDown}
          onToggleNodeExpansion={toggleNodeExpansion}
          onCreateBranch={createBranch}
          onDeleteNode={deleteNode}
          onToggleModelSelector={toggleModelSelector}
          onUpdateModel={updateNodeModel}
          onUpdateSystemPrompt={updateNodeSystemPrompt}
          onUpdateContext={updateNodeContext}
          onInputChange={(nodeId, value) =>
            setInputValues((prev) => ({
              ...prev,
              [nodeId]: value
            }))
          }
          onSendMessage={sendMessage}
        />

        <CanvasControls
          zoom={zoom}
          onZoomIn={() => setZoom((prev) => Math.min(prev * 1.2, 3))}
          onZoomOut={() => setZoom((prev) => Math.max(prev / 1.2, 0.3))}
        />

        <BranchSelectionBanner selectedText={selectedText} onCreateBranch={handleBranchFromBanner} />
      </div>
    </div>
  );
};

export default CanvasChatApp;
