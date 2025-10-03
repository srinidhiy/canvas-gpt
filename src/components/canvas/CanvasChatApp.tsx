import React, { useCallback, useEffect, useRef, useState } from 'react';

import CanvasStage from './CanvasStage';
import CanvasControls from './CanvasControls';
import BranchSelectionBanner from './BranchSelectionBanner';
import { MODELS } from '../../constants/models';
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
  calculateChildLayout,
  createBranchTitle,
  simulateAIResponse
} from '../../utils/canvas';

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
    isExpanded: false,
    model: 'claude-sonnet-4'
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

  const canvasRef = useRef<SVGSVGElement>(null);
  const chatScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const toggleNodeExpansion = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, isExpanded: !node.isExpanded } : node))
    );
  };

  const handleTextSelection = useCallback((nodeId: string, messageIndex: number) => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
        const selectedTextContent = selection.toString().trim();
        if (selectedTextContent.length > 3) {
          setSelectedText({
            nodeId,
            messageIndex,
            text: selectedTextContent,
            range: selection.getRangeAt(0).cloneRange()
          });
        }
      }
    }, 10);
  }, []);

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.selectable-message') && !target.closest('.branch-button')) {
        setSelectedText({});
      }
      if (!target.closest('.model-selector')) {
        setShowModelSelector({});
      }
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && (selection.rangeCount === 0 || !selection.toString().trim())) {
        setSelectedText({});
      }
    };

    document.addEventListener('mousedown', handleGlobalClick);
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const createBranchFromText = (parentId: string, selectedContent: string) => {
    const parent = findNode(parentId);
    if (!parent) return;

    const newNodeId = `node-${Date.now()}`;
    const branchTitle = createBranchTitle(selectedContent);

    const contextMessage: Message = {
      role: 'system',
      content: `Exploring: "${selectedContent}"`
    };

    const newNode: CanvasNode = {
      id: newNodeId,
      x: 0,
      y: 0,
      messages: [contextMessage],
      children: [],
      parent: parentId,
      isActive: true,
      title: branchTitle,
      isExpanded: true,
      model: parent.model
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
  };

  const createBranch = (parentId: string) => {
    const parent = findNode(parentId);
    if (!parent) return;

    const newNodeId = `node-${Date.now()}`;
    const branchNumber = parent.children.length + 1;

    const newNode: CanvasNode = {
      id: newNodeId,
      x: 0,
      y: 0,
      messages: [
        { role: 'assistant', content: 'New conversation branch started. What would you like to explore?' }
      ],
      children: [],
      parent: parentId,
      isActive: true,
      title: `Branch ${branchNumber}`,
      isExpanded: true,
      model: parent.model
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
    const inputValue = inputValues[nodeId] || '';
    if (!inputValue.trim()) return;

    const node = findNode(nodeId);
    const userMessage: Message = { role: 'user', content: inputValue };
    addMessage(nodeId, userMessage);

    setInputValues((prev) => ({ ...prev, [nodeId]: '' }));
    setIsProcessing((prev) => ({ ...prev, [nodeId]: true }));

    setTimeout(() => {
      const aiResponse: Message = {
        role: 'assistant',
        content: simulateAIResponse(node?.model || 'claude-sonnet-4')
      };
      addMessage(nodeId, aiResponse);
      setIsProcessing((prev) => ({ ...prev, [nodeId]: false }));
    }, 1200);
  };

  const handleMouseDown = (event: React.MouseEvent<SVGForeignObjectElement, MouseEvent>, nodeId: string) => {
    const target = event.target as Element;
    if (
      target.closest('.chat-content') ||
      target.closest('input') ||
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
    event.preventDefault();
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

  const handleBranchFromBanner = () => {
    if (selectedText.nodeId && selectedText.text) {
      createBranchFromText(selectedText.nodeId, selectedText.text);
    }
  };

  return (
    <div className="h-screen bg-slate-50 relative overflow-hidden">
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
        onInputChange={(nodeId, value) =>
          setInputValues((prev) => ({
            ...prev,
            [nodeId]: value
          }))
        }
        onSendMessage={sendMessage}
        onTextSelection={handleTextSelection}
      />

      <CanvasControls
        zoom={zoom}
        onZoomIn={() => setZoom((prev) => Math.min(prev * 1.2, 3))}
        onZoomOut={() => setZoom((prev) => Math.max(prev / 1.2, 0.3))}
      />

      <BranchSelectionBanner selectedText={selectedText} onCreateBranch={handleBranchFromBanner} />
    </div>
  );
};

export default CanvasChatApp;
