import React from 'react';

import { CanvasNode, Model, PanOffset } from '../../types/canvas';
import { getConnectionPoints, NODE_WIDTH, EXPANDED_HEIGHT, COLLAPSED_HEIGHT } from '../../utils/canvas';
import CanvasNodeCard from './CanvasNodeCard';

interface CanvasStageProps {
  nodes: CanvasNode[];
  models: Model[];
  zoom: number;
  panOffset: PanOffset;
  isPanning: boolean;
  canvasRef: React.RefObject<SVGSVGElement>;
  chatScrollRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  inputValues: Record<string, string>;
  isProcessing: Record<string, boolean>;
  showModelSelector: Record<string, boolean>;
  onCanvasMouseDown: (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => void;
  onCanvasWheel: (event: React.WheelEvent<SVGSVGElement>) => void;
  onNodeMouseDown: (event: React.MouseEvent<SVGForeignObjectElement, MouseEvent>, nodeId: string) => void;
  onToggleNodeExpansion: (nodeId: string) => void;
  onCreateBranch: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onToggleModelSelector: (nodeId: string) => void;
  onUpdateModel: (nodeId: string, modelId: string) => void;
  onInputChange: (nodeId: string, value: string) => void;
  onSendMessage: (nodeId: string) => void;
  onTextSelection: (nodeId: string, messageIndex: number) => void;
}

const CanvasStage: React.FC<CanvasStageProps> = ({
  nodes,
  models,
  zoom,
  panOffset,
  isPanning,
  canvasRef,
  chatScrollRefs,
  inputValues,
  isProcessing,
  showModelSelector,
  onCanvasMouseDown,
  onCanvasWheel,
  onNodeMouseDown,
  onToggleNodeExpansion,
  onCreateBranch,
  onDeleteNode,
  onToggleModelSelector,
  onUpdateModel,
  onInputChange,
  onSendMessage,
  onTextSelection
}) => {
  const getModelInfo = (modelId: string) => models.find((model) => model.id === modelId) ?? models[0];

  const renderConnection = (parentId: string, childId: string) => {
    const parentNode = nodes.find((node) => node.id === parentId);
    const childNode = nodes.find((node) => node.id === childId);

    if (!parentNode || !childNode) {
      return null;
    }

    const { parentX, parentY, childX, childY } = getConnectionPoints(parentNode, childNode);
    const midY = (parentY + childY) / 2;
    const path = `M ${parentX} ${parentY} C ${parentX} ${midY}, ${childX} ${midY}, ${childX} ${childY}`;

    return (
      <g key={`${parentId}-${childId}`}>
        <defs>
          <linearGradient id={`gradient-${parentId}-${childId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <marker
            id={`arrow-${parentId}-${childId}`}
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
          stroke={`url(#gradient-${parentId}-${childId})`}
          strokeWidth="3"
          fill="none"
          opacity="0.8"
          markerEnd={`url(#arrow-${parentId}-${childId})`}
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
        />
      </g>
    );
  };

  const getNodeHeight = (node: CanvasNode) => (node.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT);

  return (
    <svg
      ref={canvasRef}
      className="w-full h-full cursor-grab"
      onMouseDown={onCanvasMouseDown}
      onWheel={onCanvasWheel}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      <g transform={`translate(${panOffset.x * zoom},${panOffset.y * zoom}) scale(${zoom})`}>
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" strokeWidth="1" opacity="0.4" />
          </pattern>
        </defs>
        <rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#grid)" />

        {nodes.flatMap((node) => node.children.map((childId) => renderConnection(node.id, childId)))}

        {nodes.map((node) => (
          <g key={node.id}>
            <foreignObject
              x={node.x}
              y={node.y}
              width={NODE_WIDTH}
              height={getNodeHeight(node)}
              onMouseDown={(event) => onNodeMouseDown(event, node.id)}
              className="cursor-move canvas-node"
            >
              <CanvasNodeCard
                node={node}
                model={getModelInfo(node.model)}
                isRoot={node.id === 'root'}
                inputValue={inputValues[node.id] ?? ''}
                isProcessing={Boolean(isProcessing[node.id])}
                showModelSelector={Boolean(showModelSelector[node.id])}
                models={models}
                onToggleExpansion={() => onToggleNodeExpansion(node.id)}
                onCreateBranch={() => onCreateBranch(node.id)}
                onDelete={() => onDeleteNode(node.id)}
                onToggleModelSelector={() => onToggleModelSelector(node.id)}
                onSelectModel={(modelId) => onUpdateModel(node.id, modelId)}
                onInputChange={(value) => onInputChange(node.id, value)}
                onSend={() => onSendMessage(node.id)}
                onTextSelection={(messageIndex) => onTextSelection(node.id, messageIndex)}
                chatScrollRef={(element) => {
                  chatScrollRefs.current[node.id] = element;
                }}
              />
            </foreignObject>
          </g>
        ))}
      </g>
    </svg>
  );
};

export default CanvasStage;
