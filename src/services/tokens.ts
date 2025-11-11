import { Message } from '../types/canvas';

const WHITESPACE_REGEX = /\s+/g;

export const estimateTokens = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const charEstimate = Math.ceil(trimmed.length / 4);
  const wordEstimate = Math.ceil(trimmed.replace(WHITESPACE_REGEX, ' ').split(' ').length * 1.3);

  return Math.max(charEstimate, wordEstimate);
};

export const estimateMessageTokens = (message: Message): number => estimateTokens(message.content) + 4;

export const sumMessageTokens = (messages: Message[]): number =>
  messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
