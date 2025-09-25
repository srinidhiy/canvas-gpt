import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Send, Trash2, GitBranch, ChevronDown, Zap, Move } from 'lucide-react';

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

const initialNodes: Node[] = [
  {
    id: 'root',
    x: 400,
    y: 100,
    messages: [
      { role: 'assistant' as const, content: 'Hello! I\'m ready to help you explore ideas through branching conversations. What would you like to discuss?' }
    ],
    children: [],
    parent: null,
    isActive: true,
    title: 'Main Thread',
    isExpanded: false,
    model: 'claude-sonnet-4'
  }
];

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

const App = () => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const canvasRef = useRef<SVGSVGElement>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [selectedText, setSelectedText] = useState<SelectedText>({});
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [showModelSelector, setShowModelSelector] = useState<Record<string, boolean>>({});

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

  const simulateAIResponse = (_userMessage: string, model: string): string => {
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
    
    const userMessage: Message = { role: 'user', content: inputValue };
    addMessage(nodeId, userMessage);
    
    // Clear input and show processing
    setInputValues(prev => ({ ...prev, [nodeId]: '' }));
    setIsProcessing(prev => ({ ...prev, [nodeId]: true }));
    
    // Simulate AI response after a delay
    setTimeout(() => {
      const currentNode = findNode(nodeId);
      if (currentNode) {
        const aiResponse: Message = { role: 'assistant', content: simulateAIResponse(inputValue, currentNode.model) };
        addMessage(nodeId, aiResponse);
        setIsProcessing(prev => ({ ...prev, [nodeId]: false }));
      }
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

  const createBranchTitle = (selectedTextContent: string, _parentTitle: string): string => {
    // Clean the text and take first meaningful words
    const cleanText = selectedTextContent.replace(/[^\w\s]/g, ' ').trim();
    const words = cleanText.split(/\s+/).filter(word => word.length > 2);
    const firstWords = words.slice(0, 3).join(' ');
    return firstWords.length > 20 ? firstWords.slice(0, 20) + '...' : firstWords || 'New Branch';
  };

  const createBranchFromText = (parentId: string, _messageIndex: number, selectedTextContent: string) => {
    const parent = findNode(parentId);
    if (!parent) return;

    const newNodeId = `node-${Date.now()}`;
    const branchTitle = createBranchTitle(selectedTextContent, parent.title);
    
    // Create context message for the branch
    const contextMessage: Message = {
      role: 'system',
      content: `Exploring: "${selectedTextContent}"`
    };

    const newNode = {
      id: newNodeId,
      x: parent.x + 500 + (parent.children.length * 50),
      y: parent.y + 300 + (parent.children.length * 40),
      messages: [contextMessage],
      children: [],
      parent: parentId,
      isActive: true,
      title: branchTitle,
      isExpanded: true,
      model: parent.model
    };

    setNodes(prev => [
      ...prev,
      newNode,
      ...prev.map(node => 
        node.id === parentId 
          ? { ...node, children: [...node.children, newNodeId] }
          : node
      )
    ]);

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
    
    const newNode = {
      id: newNodeId,
      x: parent.x + 500 + (parent.children.length * 50),
      y: parent.y + 300 + (parent.children.length * 40),
      messages: [
        { role: 'assistant' as const, content: 'New conversation branch started. What would you like to explore?' }
      ],
      children: [],
      parent: parentId,
      isActive: true,
      title: `Branch ${branchNumber}`,
      isExpanded: true,
      model: parent.model
    };

    setNodes(prev => [
      ...prev,
      newNode,
      ...prev.map(node => 
        node.id === parentId 
          ? { ...node, children: [...node.children, newNodeId] }
          : node
      )
    ]);
  };

  const deleteNode = (nodeId: string) => {
    if (nodeId === 'root') return;
    
    const nodeToDelete = findNode(nodeId);
    if (!nodeToDelete) return;

    setNodes(prev => prev
      .filter(node => node.id !== nodeId && !isDescendantOf(node.id, nodeId))
      .map(node => 
        node.children.includes(nodeId)
          ? { ...node, children: node.children.filter(id => id !== nodeId) }
          : node
      )
    );
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
    const node = findNode(nodeId);
    if (!node || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    setDraggedNode(nodeId);
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - panOffset.x - node.x,
      y: (e.clientY - rect.top) / zoom - panOffset.y - node.y
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggedNode && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const newX = (e.clientX - rect.left) / zoom - panOffset.x - dragOffset.x;
      const newY = (e.clientY - rect.top) / zoom - panOffset.y - dragOffset.y;
      
      setNodes(prev => prev.map(node =>
        node.id === draggedNode
          ? { ...node, x: newX, y: newY }
          : node
      ));
    } else if (isPanning) {
      setPanOffset(prev => ({
        x: prev.x + e.movementX / zoom,
        y: prev.y + e.movementY / zoom
      }));
    }
  }, [draggedNode, isPanning, dragOffset, zoom, panOffset]);

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
    const parentCenterX = parentNode.x + 250;
    const parentCenterY = parentNode.y + (parentNode.isExpanded ? 250 : 70);
    const childCenterX = childNode.x + 250;
    const childCenterY = childNode.y + (childNode.isExpanded ? 250 : 70);

    // Calculate connection points on node edges
    const dx = childCenterX - parentCenterX;
    const dy = childCenterY - parentCenterY;
    
    // Parent connection point (right side)
    let parentX = parentNode.x + 480;
    let parentY = parentCenterY;
    
    // Child connection point (left side)
    let childX = childNode.x;
    let childY = childCenterY;

    // Adjust for different orientations
    if (dx < 0) { // Child is to the left of parent
      parentX = parentNode.x;
      childX = childNode.x + 480;
    }
    
    if (Math.abs(dy) > Math.abs(dx)) { // More vertical than horizontal
      if (dy > 0) { // Child below parent
        parentX = parentCenterX;
        parentY = parentNode.y + (parentNode.isExpanded ? 500 : 140);
        childX = childCenterX;
        childY = childNode.y;
      } else { // Child above parent
        parentX = parentCenterX;
        parentY = parentNode.y;
        childX = childCenterX;
        childY = childNode.y + (childNode.isExpanded ? 500 : 140);
      }
    }

    return { parentX, parentY, childX, childY };
  };

  const renderConnection = (parent: string, child: string) => {
    const parentNode = findNode(parent);
    const childNode = findNode(child);
    if (!parentNode || !childNode) return null;

    const { parentX, parentY, childX, childY } = getConnectionPoints(parentNode, childNode);
    
    // Create a smooth curved path
    const midX = (parentX + childX) / 2;
    const controlOffset = Math.min(100, Math.abs(childX - parentX) / 3);
    
    const path = `M ${parentX} ${parentY} C ${parentX + controlOffset} ${parentY}, ${childX - controlOffset} ${childY}, ${childX} ${childY}`;

    return (
      <g key={`${parent}-${child}`}>
        <defs>
          <linearGradient id={`gradient-${parent}-${child}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path
          d={path}
          stroke={`url(#gradient-${parent}-${child})`}
          strokeWidth="2"
          fill="none"
          opacity="0.7"
          markerEnd="url(#arrowhead)"
          className="transition-all duration-300"
        />
        <circle
          cx={midX}
          cy={(parentY + childY) / 2}
          r="2"
          fill="#6366f1"
          opacity="0.6"
        />
      </g>
    );
  };

  const getModelInfo = (modelId: string): Model => models.find(m => m.id === modelId) || models[0];

  return (
    <div className="h-screen bg-slate-50 relative overflow-hidden">
      <svg
        ref={canvasRef}
        className="w-full h-full cursor-grab transition-all duration-200"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setIsPanning(true);
          }
        }}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#6366f1"
            />
          </marker>
        </defs>
        
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
                <div className={`bg-white rounded-xl shadow-lg border-2 h-full flex flex-col transition-all duration-300 ${
                  node.isExpanded ? 'border-indigo-300 shadow-xl' : 'border-slate-200'
                }`} 
                style={{ 
                  boxShadow: node.isExpanded 
                    ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' 
                    : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  transform: node.isExpanded ? 'scale(1)' : 'scale(0.98)'
                }}>
                  {/* Header */}
                  <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-xl border-b border-slate-200 flex justify-between items-center cursor-move">
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
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-content">
                        {node.messages.map((msg, idx) => (
                          <div key={idx} className="relative">
                            <div className={`p-4 rounded-xl transition-all duration-200 ${
                              msg.role === 'user' 
                                ? 'bg-indigo-500 text-white ml-auto max-w-[80%] shadow-sm' 
                                : msg.role === 'system'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200 text-sm italic max-w-[85%] shadow-sm'
                                : 'bg-slate-100 text-slate-800 max-w-[85%] shadow-sm hover:shadow-md'
                            }`}>
                              <div
                                className={msg.role === 'assistant' ? 'selectable-message select-text cursor-text' : ''}
                                onMouseUp={() => msg.role === 'assistant' && handleTextSelection(node.id, idx)}
                              >
                                {msg.content}
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {isProcessing[node.id] && (
                          <div className="flex items-center gap-3 text-indigo-600 p-4 bg-indigo-50 rounded-xl">
                            <Zap className="w-4 h-4 animate-pulse" />
                            <span className="text-sm">Thinking...</span>
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Input Area */}
                      <div className="p-4 border-t border-slate-200 chat-content">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="relative model-selector">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowModelSelector(prev => ({ ...prev, [node.id]: !prev[node.id] }));
                              }}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${getModelInfo(node.model).color} hover:shadow-sm`}
                            >
                              <span className="font-medium">{getModelInfo(node.model).short}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showModelSelector[node.id] ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {showModelSelector[node.id] && (
                              <div className="absolute bottom-full mb-2 left-0 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-48 animate-in slide-in-from-bottom-2 duration-200">
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
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={inputValues[node.id] || ''}
                            onChange={(e) => setInputValues(prev => ({ 
                              ...prev, 
                              [node.id]: e.target.value 
                            }))}
                            onKeyPress={(e: React.KeyboardEvent) => e.key === 'Enter' && sendMessage(node.id)}
                            placeholder="Type your message..."
                            className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                            disabled={isProcessing[node.id]}
                          />
                          <button
                            onClick={() => sendMessage(node.id)}
                            disabled={isProcessing[node.id]}
                            className="px-4 py-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Collapsed View */
                    <div className="flex-1 p-4 overflow-hidden cursor-move">
                      <div className="space-y-3">
                        {node.messages.slice(-2).map((msg, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg text-sm transition-all duration-200 ${
                              msg.role === 'user' 
                                ? 'bg-indigo-100 text-indigo-800' 
                                : msg.role === 'system'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {msg.content.length > 120 ? msg.content.slice(0, 120) + '...' : msg.content}
                          </div>
                        ))}
                        {node.messages.length > 2 && (
                          <div className="text-slate-500 text-center text-xs">
                            +{node.messages.length - 2} more messages
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
              createBranchFromText(selectedText.nodeId!, selectedText.messageIndex!, selectedText.text!);
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

export default App;