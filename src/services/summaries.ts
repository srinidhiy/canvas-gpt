import { KNOWLEDGE_SUMMARY_SYSTEM_PROMPT, buildKnowledgeSummaryPrompt } from '../constants/prompts';
import { Message } from '../types/canvas';
import { requestAIResponse } from './aiProvider';

interface KnowledgeSummary {
  summary: string;
  parentInsights: string;
}

const SUMMARISER_MODEL = 'gpt-4o-mini';

const formatTranscript = (messages: Message[]): string =>
  messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n');

const extractJson = (payload: string): KnowledgeSummary | null => {
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed.summary === 'string' && typeof parsed.parentInsights === 'string') {
      return { summary: parsed.summary, parentInsights: parsed.parentInsights };
    }
  } catch (error) {
    const match = payload.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed.summary === 'string' && typeof parsed.parentInsights === 'string') {
        return { summary: parsed.summary, parentInsights: parsed.parentInsights };
      }
    } catch {
      return null;
    }
  }

  return null;
};

export const generateNodeKnowledge = async (
  conversation: Message[],
  nodeTitle: string
): Promise<KnowledgeSummary | null> => {
  if (conversation.length === 0) {
    return null;
  }

  const transcript = formatTranscript(conversation);
  const messages: Message[] = [
    { role: 'system', content: KNOWLEDGE_SUMMARY_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildKnowledgeSummaryPrompt(nodeTitle, transcript)
    }
  ];

  try {
    const raw = await requestAIResponse({
      model: SUMMARISER_MODEL,
      messages,
      temperature: 0.2
    });

    const parsed = extractJson(raw.trim());
    if (!parsed) {
      console.warn('Failed to parse knowledge summary payload', raw);
      return null;
    }

    return {
      summary: parsed.summary.trim(),
      parentInsights: parsed.parentInsights.trim()
    };
  } catch (error) {
    console.error('Unable to generate knowledge summary', error);
    return null;
  }
};
