import { CanvasNode } from '../types/canvas';

export const NODE_WIDTH = 480;
export const EXPANDED_HEIGHT = 500;
export const COLLAPSED_HEIGHT = 140;
export const HORIZONTAL_SPACING = 80;
export const VERTICAL_OFFSET = 600;

export const simulateAIResponse = (model: string): string => {
  const responses: Record<string, string[]> = {
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

  const fallbackResponses = responses['claude-sonnet-4'];
  const modelResponses = responses[model] || fallbackResponses;
  const randomIndex = Math.floor(Math.random() * modelResponses.length);
  return modelResponses[randomIndex];
};

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

  return {
    parentX: parentCenterX,
    parentY: parentNode.y + parentHeight,
    childX: childCenterX,
    childY: childNode.y
  };
};

export const calculateChildLayout = (parent: CanvasNode, childCount: number) => {
  const totalWidth = childCount * NODE_WIDTH + (childCount - 1) * HORIZONTAL_SPACING;
  const startX = parent.x + NODE_WIDTH / 2 - totalWidth / 2;
  const y = parent.y + VERTICAL_OFFSET;
  return { startX, y };
};
