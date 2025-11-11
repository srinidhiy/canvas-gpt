import { BASE_SYSTEM_PROMPT } from '../constants/prompts';
import { CanvasNode, Message } from '../types/canvas';
import { sumMessageTokens } from './tokens';

interface BuildContextOptions {
  nodes: CanvasNode[];
  targetNodeId: string;
  upcomingMessages?: Message[];
  maxTokens?: number;
  recentMessageWindow?: number;
}

const DEFAULT_MAX_TOKENS = 6000;
const DEFAULT_RECENT_WINDOW = 12;

const toNodeMap = (nodes: CanvasNode[]) => new Map(nodes.map((node) => [node.id, node] as const));

export const buildContextMessages = ({
  nodes,
  targetNodeId,
  upcomingMessages = [],
  maxTokens = DEFAULT_MAX_TOKENS,
  recentMessageWindow = DEFAULT_RECENT_WINDOW
}: BuildContextOptions): Message[] => {
  const nodeMap = toNodeMap(nodes);
  const targetNode = nodeMap.get(targetNodeId);

  if (!targetNode) {
    return [{ role: 'system', content: BASE_SYSTEM_PROMPT }];
  }

  const systemMessages: Message[] = [{ role: 'system', content: BASE_SYSTEM_PROMPT }];

  const pushSystem = (content: string) => {
    const trimmed = content.trim();
    if (trimmed) {
      systemMessages.push({ role: 'system', content: trimmed });
    }
  };

  pushSystem(`Focus node: "${targetNode.title}"`);

  if (targetNode.summary.trim()) {
    pushSystem(`Node summary:\n${targetNode.summary.trim()}`);
  }

  const childInsights = Object.values(targetNode.childInsights);
  if (childInsights.length > 0) {
    pushSystem(`Insights from child branches:\n${childInsights.join('\n')}`);
  }

  const ancestry: Array<{ ancestor: CanvasNode; childId: string }> = [];
  let childId = targetNodeId;
  let parentId = targetNode.parent;

  while (parentId) {
    const ancestor = nodeMap.get(parentId);
    if (!ancestor) {
      break;
    }
    ancestry.push({ ancestor, childId });
    childId = ancestor.id;
    parentId = ancestor.parent;
  }

  ancestry.reverse().forEach(({ ancestor, childId: linkId }) => {
    if (ancestor.summary.trim()) {
      pushSystem(`Ancestor ${ancestor.title} summary:\n${ancestor.summary.trim()}`);
    }
    const linkedInsight = ancestor.childInsights[linkId];
    if (linkedInsight) {
      pushSystem(`Ancestor insight towards this branch:\n${linkedInsight}`);
    }
  });

  let trimmedSystemMessages = [...systemMessages];
  while (sumMessageTokens(trimmedSystemMessages) > maxTokens && trimmedSystemMessages.length > 1) {
    trimmedSystemMessages = trimmedSystemMessages.slice(0, -1);
  }

  const historicalMessages = [...targetNode.messages, ...upcomingMessages];
  const startIndex = Math.max(0, historicalMessages.length - recentMessageWindow);
  const conversationSlice = historicalMessages.slice(startIndex);

  let combined: Message[] = [...trimmedSystemMessages, ...conversationSlice];
  let tokenCount = sumMessageTokens(combined);

  while (tokenCount > maxTokens && conversationSlice.length > 1) {
    conversationSlice.shift();
    combined = [...trimmedSystemMessages, ...conversationSlice];
    tokenCount = sumMessageTokens(combined);
  }

  if (tokenCount > maxTokens && trimmedSystemMessages.length > 1) {
    trimmedSystemMessages = trimmedSystemMessages.slice(0, 1);
    combined = [...trimmedSystemMessages, ...conversationSlice];
  }

  return combined;
};
