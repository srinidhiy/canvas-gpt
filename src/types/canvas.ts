export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface CanvasNode {
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
  summary: string;
  childInsights: Record<string, string>;
  knowledgeUpdatedAt: string | null;
}

export interface Model {
  id: string;
  name: string;
  short: string;
  description: string;
  color: string;
}

export interface ChatSession {
  id: string;
  title: string;
  summary: string;
  updated_at: string;
  created_at: string;
}

export interface SelectedText {
  nodeId?: string;
  messageIndex?: number;
  text?: string;
  range?: Range;
}

export interface DragOffset {
  x: number;
  y: number;
}

export interface PanOffset {
  x: number;
  y: number;
}
