import { CanvasNode } from '../types/canvas';

export const NODE_WIDTH = 600;
export const EXPANDED_HEIGHT = 640;
export const COLLAPSED_HEIGHT = 180;
export const HORIZONTAL_SPACING = 140;
export const VERTICAL_OFFSET = 720;

export const createBranchTitle = (selectedTextContent: string): string => {
  const cleanText = selectedTextContent.replace(/[^\w\s]/g, ' ').trim();
  const words = cleanText.split(/\s+/).filter(word => word.length > 2);
  const firstWords = words.slice(0, 3).join(' ');
  if (!firstWords) return 'New Branch';
  return firstWords.length > 20 ? `${firstWords.slice(0, 20)}...` : firstWords;
};

export const getConnectionPoints = (parentNode: CanvasNode, childNode: CanvasNode) => {
  const parentCenterX = parentNode.x + NODE_WIDTH / 2;
  const childCenterX = childNode.x + NODE_WIDTH / 2;
  const parentHeight = parentNode.isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

  const arrowPadding = 24;

  return {
    parentX: parentCenterX,
    parentY: parentNode.y + parentHeight - arrowPadding / 2,
    childX: childCenterX,
    childY: childNode.y - arrowPadding
  };
};

export const calculateChildLayout = (parent: CanvasNode, childCount: number) => {
  const totalWidth = childCount * NODE_WIDTH + (childCount - 1) * HORIZONTAL_SPACING;
  const startX = parent.x + NODE_WIDTH / 2 - totalWidth / 2;
  const y = parent.y + VERTICAL_OFFSET;
  return { startX, y };
};
