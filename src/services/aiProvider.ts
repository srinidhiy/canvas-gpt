import { supabase } from '../lib/supabaseClient';
import type { Message } from '../types/canvas';

type AIProviderResponse = {
  content: string;
};

interface AIRequest {
  model: string;
  messages: Message[];
  temperature?: number;
}

export const requestAIResponse = async ({
  model,
  messages,
  temperature = 0.7
}: AIRequest): Promise<string> => {
  const { data, error } = await supabase.functions.invoke<AIProviderResponse>('chat-completion', {
    body: {
      model,
      messages,
      temperature
    }
  });

  if (error) {
    throw new Error(error.message ?? 'Unable to reach the AI service.');
  }

  if (!data || typeof data.content !== 'string' || !data.content.trim()) {
    throw new Error('The AI service returned an empty response.');
  }

  return data.content.trim();
};
