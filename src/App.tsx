import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Send, Trash2, GitBranch, ChevronDown, Loader2, Move } from 'lucide-react';

// Type definitions
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Node {
  id: string;
  x: number;
  y: number;
  messages: Message[];
  children: string[];
  parent: string | null;
  isActive: boolean;
  title: string;
  isExpanded: boolean;
  model: string;
}

interface Model {
  id: string;
  name: string;
  short: string;
  description: string;
  color: string;
}

interface SelectedText {
  nodeId?: string;
  messageIndex?: number;
  text?: string;
  range?: Range;
}

interface DragOffset {
  x: number;
  y: number;
}

interface PanOffset {
  x: number;
  y: number;
}

const CanvasChatApp = () => {
  const [nodes, setNodes] = useState<Node[]>([
    {
      id: 'root',
      x: 400,
      y: 100,
      messages: [
        { role: 'assistant', content: 'Hello! I\'m ready to help you explore ideas through branching conversations. What would you like to discuss?' }
      ],
      children: [],
      parent: null,
      isActive: true,
      title: 'Main Thread',
      isExpanded: false,
      model: 'claude-sonnet-4'
    }
  ]);
  
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const canvasRef = useRef<SVGSVGElement>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [selectedText, setSelectedText] = useState<SelectedText>({});
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [showModelSelector, setShowModelSelector] = useState<Record<string, boolean>>({});
  const chatScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const models: Model[] = [
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', short: 'Sonnet 4', description: 'Balanced performance', color: 'bg-blue-50 text-blue-700' },
    { id: 'claude-opus-4', name: 'Claude Opus 4', short: 'Opus 4', description: 'Most capable', color: 'bg-purple-50 text-purple-700' },
    { id: 'gpt-4', name: 'GPT-4', short: 'GPT-4', description: 'OpenAI flagship', color: 'bg-green-50 text-green-700' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', short: 'GPT-3.5', description: 'Fast and efficient', color: 'bg-orange-50 text-orange-700' }
  ];

  const findNode = (nodeId: string): Node | undefined => nodes.find(n => n.id === nodeId);
  
  const addMessage = (nodeId: string, message: Message) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId 
        ? { ...node, messages: [...node.messages, message] }
        : node
    ));
    
    // Auto-scroll to bottom after message is added
    setTimeout(() => {
      const chatElement = chatScrollRefs.current[nodeId];
      if (chatElement) {
        chatElement.scrollTop = chatElement.scrollHeight;
      }
    }, 100);
  };

  const updateNodeModel = (nodeId: string, modelId: string) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId
        ? { ...node, model: modelId }
        : node
    ));
    setShowModelSelector(prev => ({ ...prev, [nodeId]: false }));
  };

  const toggleNodeExpansion = (nodeId: string) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId
        ? { ...node, isExpanded: !node.isExpanded }
        : node
    ));
  };

  const simulateAIResponse = (userMessage: string, model: string): string => {
    const responses = {
      'claude-sonnet-4': [
        "I understand your question. There are several interesting angles we could explore here. We might consider the theoretical foundations, practical applications, or creative interpretations. Each path offers unique insights worth investigating.",
        "That's a thoughtful inquiry. I can see multiple dimensions to this topic: analytical approaches that break down the components, synthetic methods that build connections, and exploratory paths that venture into new territory.",
        "Excellent point. This touches on several interconnected concepts. We could examine the immediate implications, trace the historical context, or project future possibilities. Each direction reveals different aspects of the subject."
      ],
      'claude-opus-4': [
        "This is a fascinating question that intersects multiple domains of knowledge. I can provide deep analysis across theoretical frameworks, empirical evidence, and philosophical implications. The complexity here suggests we might benefit from exploring parallel reasoning paths.",
        "Your inquiry opens up rich avenues for exploration. I'm seeing connections to fundamental principles, emergent patterns, and practical considerations. We could pursue rigorous analytical threads or creative synthesis approaches - both have merit.",
        "This touches on some profound concepts. The question has layers that we could unpack systematically, examining underlying assumptions, exploring edge cases, and considering broader implications for understanding."
      ],
      'gpt-4': [
        "That's an interesting question. There are several ways to approach this topic, each with its own merits. We could focus on the technical aspects, explore practical applications, or dive into the conceptual framework.",
        "I can help you explore this from multiple angles. There are immediate considerations and longer-term implications to think about. Which direction interests you most?",
        "Good question. This involves several key components that work together. We could break this down systematically or look at it from different perspectives."
      ],
      'gpt-3.5-turbo': [
        "That's a great question! There are a few different approaches we could take. What specifically interests you most about this topic?",
        "I can help with that. There are several key points to consider. Would you like me to focus on any particular aspect?",
        "Interesting topic! We could explore this from different angles. What would be most useful for you?"
      ]
    };
    
    const modelResponses = responses[model as keyof typeof responses] || responses['claude-sonnet-4'];
    return modelResponses[Math.floor(Math.random() * modelResponses.length)];
  };

  const sendMessage = async (nodeId: string) => {
    const inputValue = inputValues[nodeId] || '';
    if (!inputValue.trim()) return;
    
    const node = findNode(nodeId);
    const userMessage: Message = { role: 'user', content: inputValue };
    addMessage(nodeId, userMessage);
    
    // Clear input and show processing
    setInputValues(prev => ({ ...prev, [nodeId]: '' }));
    setIsProcessing(prev => ({ ...prev, [nodeId]: true }));
    
    // Simulate AI response after a delay
    setTimeout(() => {
      const aiResponse: Message = { role: 'assistant', content: simulateAIResponse(inputValue, node?.model || 'claude-sonnet-4') };
      addMessage(nodeId, aiResponse);
      setIsProcessing(prev => ({ ...prev, [nodeId]: false }));
    }, 1200);
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

  // Clear selection when clicking elsewhere
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Element;
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

  const createBranchTitle = (selectedTextContent: string, parentTitle: string): string => {
    // Clean the text and take first meaningful words
    const cleanText = selectedTextContent.replace(/[^\w\s]/g, ' ').trim();
    const words = cleanText.split(/\s+/).filter(word => word.length > 2);
    const firstWords = words.slice(0, 3).join(' ');
    return firstWords.length > 20 ? firstWords.slice(0, 20) + '...' : firstWords || 'New Branch';
  };

  const repositionChildren = (parentId: string) => {
    const parent = findNode(parentId);
    if (!parent || parent.children.length === 0) return;

    const nodeWidth = 480;
    const horizontalSpacing = 80;
    const verticalOffset = 600;
    
    // Calculate total width needed for all children
    const totalWidth = parent.children.length * nodeWidth + (parent.children.length - 1) * horizontalSpacing;
    const startX = parent.x + (nodeWidth / 2) - (totalWidth / 2);
    const childY = parent.y + verticalOffset;

    // Update all children positions
    const updatedNodes = nodes.map(node => {
      const childIndex = parent.children.indexOf(node.id);
      if (childIndex !== -1) {
        const newX = startX + childIndex * (nodeWidth + horizontalSpacing);
        return { ...node, x: newX, y: childY };
      }
      return node;
    });

    setNodes(updatedNodes);
  };

  const createBranchFromText = (parentId: string, messageIndex: number, selectedTextContent: string) => {
    const parent = findNode(parentId);
    if (!parent) return;

    const newNodeId = `node-${Date.now()}`;
    const branchTitle = createBranchTitle(selectedTextContent, parent.title);
    
    // Create context message for the branch
    const contextMessage: Message = {
      role: 'system',
      content: `Exploring: "${selectedTextContent}"`
    };

    // Calculate position for new branch immediately
    const nodeWidth = 480;
    const horizontalSpacing = 80;
    const verticalOffset = 600;
    const newChildrenCount = parent.children.length + 1;
    const totalWidth = newChildrenCount * nodeWidth + (newChildrenCount - 1) * horizontalSpacing;
    const startX = parent.x + (nodeWidth / 2) - (totalWidth / 2);
    const childY = parent.y + verticalOffset;
    const newX = startX + parent.children.length * (nodeWidth + horizontalSpacing);

    const newNode = {
      id: newNodeId,
      x: newX,
      y: childY,
      messages: [contextMessage],
      children: [],
      parent: parentId,
      isActive: true,
      title: branchTitle,
      isExpanded: true,
      model: parent.model
    };

    // Update nodes and reposition ALL children
    setNodes(prevNodes => {
      // First add the new node and update parent
      let updatedNodes = [
        ...prevNodes.map(node => 
          node.id === parentId 
            ? { ...node, children: [...node.children, newNodeId] }
            : node
        ),
        newNode
      ];

      // Now reposition ALL children of this parent
      const parentNode = updatedNodes.find(n => n.id === parentId);
      if (parentNode && parentNode.children.length > 0) {
        const totalWidth = parentNode.children.length * nodeWidth + (parentNode.children.length - 1) * horizontalSpacing;
        const startX = parentNode.x + (nodeWidth / 2) - (totalWidth / 2);
        
        updatedNodes = updatedNodes.map(node => {
          const childIndex = parentNode.children.indexOf(node.id);
          if (childIndex !== -1) {
            return { 
              ...node, 
              x: startX + childIndex * (nodeWidth + horizontalSpacing), 
              y: childY 
            };
          }
          return node;
        });
      }

      return updatedNodes;
    });

    // Clear selection
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
    
    // Calculate position for new branch immediately
    const nodeWidth = 480;
    const horizontalSpacing = 80;
    const verticalOffset = 600;
    const newChildrenCount = parent.children.length + 1;
    const totalWidth = newChildrenCount * nodeWidth + (newChildrenCount - 1) * horizontalSpacing;
    const startX = parent.x + (nodeWidth / 2) - (totalWidth / 2);
    const childY = parent.y + verticalOffset;
    const newX = startX + parent.children.length * (nodeWidth + horizontalSpacing);
    
    const newNode: Node = {
      id: newNodeId,
      x: newX,
      y: childY,
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

    // Update nodes and reposition ALL children
    setNodes(prevNodes => {
      // First add the new node and update parent
      let updatedNodes = [
        ...prevNodes.map(node => 
          node.id === parentId 
            ? { ...node, children: [...node.children, newNodeId] }
            : node
        ),
        newNode
      ];

      // Now reposition ALL children of this parent
      const parentNode = updatedNodes.find(n => n.id === parentId);
      if (parentNode && parentNode.children.length > 0) {
        const totalWidth = parentNode.children.length * nodeWidth + (parentNode.children.length - 1) * horizontalSpacing;
        const startX = parentNode.x + (nodeWidth / 2) - (totalWidth / 2);
        
        updatedNodes = updatedNodes.map(node => {
          const childIndex = parentNode.children.indexOf(node.id);
          if (childIndex !== -1) {
            return { 
              ...node, 
              x: startX + childIndex * (nodeWidth + horizontalSpacing), 
              y: childY 
            };
          }
          return node;
        });
      }

      return updatedNodes;
    });
  };

  const deleteNode = (nodeId: string) => {
    if (nodeId === 'root') return;
    
    const nodeToDelete = findNode(nodeId);
    if (!nodeToDelete) return;

    const parentId = nodeToDelete.parent;

    setNodes(prevNodes => {
      // Remove the node and update parent's children array
      let updatedNodes = prevNodes
        .filter(node => node.id !== nodeId && !isDescendantOf(node.id, nodeId))
        .map(node => 
          node.children.includes(nodeId)
            ? { ...node, children: node.children.filter(id => id !== nodeId) }
            : node
        );

      // Reposition remaining children if there's a parent
      if (parentId) {
        const parentNode = updatedNodes.find(n => n.id === parentId);
        if (parentNode && parentNode.children.length > 0) {
          const nodeWidth = 480;
          const horizontalSpacing = 80;
          const verticalOffset = 600;
          
          const totalWidth = parentNode.children.length * nodeWidth + (parentNode.children.length - 1) * horizontalSpacing;
          const startX = parentNode.x + (nodeWidth / 2) - (totalWidth / 2);
          const childY = parentNode.y + verticalOffset;

          updatedNodes = updatedNodes.map(node => {
            const childIndex = parentNode.children.indexOf(node.id);
            if (childIndex !== -1) {
              return { 
                ...node, 
                x: startX + childIndex * (nodeWidth + horizontalSpacing), 
                y: childY 
              };
            }
            return node;
          });
        }
      }

      return updatedNodes;
    });
  };

  const isDescendantOf = (nodeId: string, ancestorId: string): boolean => {
    const node = findNode(nodeId);
    if (!node || !node.parent) return false;
    if (node.parent === ancestorId) return true;
    return isDescendantOf(node.parent, ancestorId);
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    const target = e.target as Element;
    if (target.closest('.chat-content') || 
        target.closest('input') || 
        target.closest('button') ||
        target.closest('.model-selector')) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    const node = findNode(nodeId);
    if (!node || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    setDraggedNode(nodeId);
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - panOffset.x - node.x,
      y: (e.clientY - rect.top) / zoom - panOffset.y - node.y
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as Element).tagName === 'rect' || (e.target as Element).tagName === 'path') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const getAllDescendants = (nodeId: string): string[] => {
    const descendants: string[] = [];
    const node = findNode(nodeId);
    if (!node) return descendants;
    
    const collectDescendants = (currentId: string) => {
      const current = findNode(currentId);
      if (current && current.children) {
        current.children.forEach(childId => {
          descendants.push(childId);
          collectDescendants(childId);
        });
      }
    };
    
    collectDescendants(nodeId);
    return descendants;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggedNode && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const newX = (e.clientX - rect.left) / zoom - panOffset.x - dragOffset.x;
      const newY = (e.clientY - rect.top) / zoom - panOffset.y - dragOffset.y;
      
      // Get current dragged node position
      const currentNode = nodes.find(n => n.id === draggedNode);
      if (currentNode) {
        const deltaX = newX - currentNode.x;
        const deltaY = newY - currentNode.y;
        
        // Get all descendants of the dragged node
        const descendants = getAllDescendants(draggedNode);
        
        setNodes(prev => prev.map(node => {
          if (node.id === draggedNode) {
            return { ...node, x: newX, y: newY };
          } else if (descendants.includes(node.id)) {
            // Move descendants by the same delta
            return { ...node, x: node.x + deltaX, y: node.y + deltaY };
          }
          return node;
        }));
      }
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      
      setPanOffset(prev => ({
        x: prev.x + dx / zoom,
        y: prev.y + dy / zoom
      }));
      
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, [draggedNode, isPanning, dragOffset, zoom, panOffset, panStart, nodes]);

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

  const getConnectionPoints = (parentNode: Node, childNode: Node) => {
    const parentW = 480;
    const parentH = parentNode.isExpanded ? 500 : 140;
    const childW = 480;
    const childH = childNode.isExpanded ? 500 : 140;

    const parentCenterX = parentNode.x + parentW / 2;
    const childCenterX = childNode.x + childW / 2;

    // Parent connects from bottom center
    const parentX = parentCenterX;
    const parentY = parentNode.y + parentH;

    // Child connects from top center
    const childX = childCenterX;
    const childY = childNode.y;

    return { parentX, parentY, childX, childY };
  };

  const renderConnection = (parent: string, child: string) => {
    const parentNode = findNode(parent);
    const childNode = findNode(child);
    if (!parentNode || !childNode) return null;

    const { parentX, parentY, childX, childY } = getConnectionPoints(parentNode, childNode);
    
    // Simple vertical curve
    const midY = (parentY + childY) / 2;
    const path = `M ${parentX} ${parentY} C ${parentX} ${midY}, ${childX} ${midY}, ${childX} ${childY}`;

    return (
      <g key={`${parent}-${child}`}>
        <defs>
          <linearGradient id={`gradient-${parent}-${child}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <marker
            id={`arrow-${parent}-${child}`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 L3,5 z" fill="#6366f1" />
          </marker>
        </defs>
        <path
          d={path}
          stroke={`url(#gradient-${parent}-${child})`}
          strokeWidth="3"
          fill="none"
          opacity="0.8"
          markerEnd={`url(#arrow-${parent}-${child})`}
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
        />
      </g>
    );
  };

  const getModelInfo = (modelId: string): Model => models.find(m => m.id === modelId) || models[0];

  return (
    <div className="h-screen bg-slate-50 relative overflow-hidden">
      <svg
        ref={canvasRef}
        className="w-full h-full cursor-grab"
        onMouseDown={handleCanvasMouseDown}
        onWheel={(e) => {
          e.preventDefault();
          if (!canvasRef.current) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const mouseX = (e.clientX - rect.left) / zoom - panOffset.x;
          const mouseY = (e.clientY - rect.top) / zoom - panOffset.y;
          
          // Reduced zoom speed - smaller multiplier for smoother zooming
          const zoomFactor = e.deltaY > 0 ? 0.97 : 1.03;
          const newZoom = Math.max(0.2, Math.min(3, zoom * zoomFactor));
          
          if (newZoom !== zoom) {
            const newPanX = panOffset.x - (mouseX * (newZoom - zoom)) / newZoom;
            const newPanY = panOffset.y - (mouseY * (newZoom - zoom)) / newZoom;
            
            setZoom(newZoom);
            setPanOffset({ x: newPanX, y: newPanY });
          }
        }}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${panOffset.x * zoom},${panOffset.y * zoom}) scale(${zoom})`}>
          {/* Subtle grid */}
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" strokeWidth="1" opacity="0.4"/>
            </pattern>
          </defs>
          <rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#grid)" />
          
          {/* Render connections */}
          {nodes.flatMap(node => 
            node.children.map(childId => renderConnection(node.id, childId))
          )}
          
          {/* Render nodes */}
          {nodes.map(node => (
            <g key={node.id}>
              <foreignObject
                x={node.x}
                y={node.y}
                width="480"
                height={node.isExpanded ? "500" : "140"}
                onMouseDown={(e) => handleMouseDown(e, node.id)}
                className="cursor-move"
              >
                <div className={`bg-white rounded-xl shadow-lg border h-full flex flex-col transition-all duration-300 ${
                  node.isExpanded ? 'border-slate-300 shadow-xl' : 'border-slate-200'
                }`}>
                  {/* Header */}
                  <div className="p-4 bg-slate-50 rounded-t-xl border-b border-slate-200 flex justify-between items-center cursor-move">
                    <div className="flex items-center gap-3">
                      <Move className="w-4 h-4 text-slate-400" />
                      <span className="font-medium text-slate-700 truncate max-w-48">{node.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${getModelInfo(node.model).color}`}>
                        {getModelInfo(node.model).short}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNodeExpansion(node.id);
                        }}
                        className="px-3 py-1 hover:bg-slate-200 rounded-lg text-xs text-slate-600 transition-colors duration-200"
                      >
                        {node.isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          createBranch(node.id);
                        }}
                        className="p-2 hover:bg-indigo-100 rounded-lg transition-colors duration-200"
                      >
                        <GitBranch className="w-4 h-4 text-indigo-600" />
                      </button>
                      {node.id !== 'root' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNode(node.id);
                          }}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors duration-200"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>

                  {node.isExpanded ? (
                    <>
                      {/* Full Chat Interface */}
                      <div 
                        ref={(el) => { chatScrollRefs.current[node.id] = el; }}
                        className="flex-1 overflow-y-auto p-4 space-y-3 chat-content scroll-smooth"
                      >
                        {node.messages.map((msg, idx) => (
                          <div key={idx}>
                            {msg.role === 'user' ? (
                              <div className="flex justify-end mb-2">
                                <div className="bg-indigo-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm max-w-[75%] shadow-sm">
                                  {msg.content}
                                </div>
                              </div>
                            ) : msg.role === 'system' ? (
                              <div className="flex justify-center mb-2">
                                <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs">
                                  {msg.content}
                                </div>
                              </div>
                            ) : (
                              <div className="mb-2">
                                <div className="flex items-start gap-2">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-1">
                                    AI
                                  </div>
                                  <div className="flex-1">
                                    <div 
                                      className="bg-slate-50 text-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200 selectable-message select-text cursor-text"
                                      onMouseUp={() => handleTextSelection(node.id, idx)}
                                    >
                                      {msg.content}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {isProcessing[node.id] && (
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                              AI
                            </div>
                            <div className="bg-slate-50 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200 flex items-center gap-2">
                              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                              <span className="text-sm text-slate-600">Thinking...</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Input Area */}
                      <div className="p-4 border-t border-slate-200 chat-content bg-white rounded-b-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="relative model-selector">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowModelSelector(prev => ({ ...prev, [node.id]: !prev[node.id] }));
                              }}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all duration-200 ${getModelInfo(node.model).color} hover:shadow-sm`}
                            >
                              <span className="font-medium">{getModelInfo(node.model).short}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showModelSelector[node.id] ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {showModelSelector[node.id] && (
                              <div className="absolute bottom-full mb-2 left-0 bg-white border border-slate-200 rounded-lg shadow-xl z-10 min-w-48">
                                {models.map((model) => (
                                  <button
                                    key={model.id}
                                    onClick={() => updateNodeModel(node.id, model.id)}
                                    className={`w-full p-3 text-left hover:bg-slate-50 flex justify-between items-center transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg ${
                                      node.model === model.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                                    }`}
                                  >
                                    <div>
                                      <div className="font-medium text-slate-800 text-sm">{model.name}</div>
                                      <div className="text-xs text-slate-500">{model.description}</div>
                                    </div>
                                    {node.model === model.id && (
                                      <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={inputValues[node.id] || ''}
                            onChange={(e) => setInputValues(prev => ({ 
                              ...prev, 
                              [node.id]: e.target.value 
                            }))}
                            onKeyPress={(e) => e.key === 'Enter' && sendMessage(node.id)}
                            placeholder="Ask anything..."
                            className="flex-1 px-4 py-2.5 bg-slate-100 border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                            disabled={isProcessing[node.id]}
                          />
                          <button
                            onClick={() => sendMessage(node.id)}
                            disabled={isProcessing[node.id]}
                            className="px-4 py-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Collapsed View */
                    <div className="flex-1 p-4 overflow-hidden cursor-move">
                      <div className="space-y-2">
                        {node.messages.slice(-2).map((msg, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-lg text-sm ${
                              msg.role === 'user' 
                                ? 'bg-indigo-100 text-indigo-800' 
                                : msg.role === 'system'
                                ? 'bg-amber-100 text-amber-700 text-xs'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content}
                          </div>
                        ))}
                        {node.messages.length > 2 && (
                          <div className="text-slate-500 text-center text-xs">
                            +{node.messages.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </foreignObject>
            </g>
          ))}
        </g>
      </svg>

      {/* Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 bg-white rounded-xl shadow-lg border border-slate-200 p-3">
        <button
          onClick={() => setZoom(prev => Math.min(prev * 1.2, 3))}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(prev => Math.max(prev / 1.2, 0.3))}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors duration-200"
        >
          <div className="w-4 h-4 flex items-center justify-center font-bold">−</div>
        </button>
        <div className="text-xs text-center text-slate-600 font-medium">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Branch from text indicator */}
      {selectedText.text && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-top-2 duration-200">
          <GitBranch className="w-4 h-4" />
          <span className="text-sm">Selected: "{selectedText.text.slice(0, 40)}{selectedText.text.length > 40 ? '...' : ''}"</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (selectedText.nodeId && selectedText.messageIndex !== undefined && selectedText.text) {
                createBranchFromText(selectedText.nodeId, selectedText.messageIndex, selectedText.text);
              }
            }}
            className="branch-button bg-indigo-700 hover:bg-indigo-800 px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200"
          >
            Branch
          </button>
        </div>
      )}
    </div>
  );
};

export default CanvasChatApp;