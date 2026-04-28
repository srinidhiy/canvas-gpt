import { pb } from '../lib/pocketbaseClient';
import type { Message } from '../types/canvas';

type AIProviderResponse = {
  content: string;
};

type StreamChunk = {
  chunk: string;
};

interface AIRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}

const getApiUrl = () => {
  const url = import.meta.env.VITE_API_URL;
  if (!url) {
    console.warn('VITE_API_URL is not set. Please add it to your .env file.');
  }
  return url ?? 'http://localhost:3001';
};

export const requestAIResponse = async ({
  model,
  messages,
  temperature = 0.7,
  stream = true,
  onChunk
}: AIRequest): Promise<string> => {
  const apiUrl = getApiUrl();
  const token = pb.authStore.token;

  if (stream && onChunk) {
    try {
      const response = await fetch(`${apiUrl}/chat-completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ model, messages, temperature, stream: true })
      });

      if (!response.ok) {
        let errorMessage = 'Unable to reach the AI service.';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          try {
            errorMessage = (await response.text()) || errorMessage;
          } catch {
            // use default
          }
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json') && !contentType.includes('stream')) {
        const jsonData = await response.json();
        if (jsonData.error) throw new Error(jsonData.error);
        if (jsonData.content) {
          onChunk(jsonData.content);
          return jsonData.content;
        }
        return requestAIResponse({ model, messages, temperature, stream: false });
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;

            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') return fullContent || ' ';

              try {
                const parsed: StreamChunk = JSON.parse(data);
                if (parsed.chunk) {
                  fullContent += parsed.chunk;
                  onChunk(parsed.chunk);
                }
              } catch {
                // skip invalid JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return fullContent || ' ';
    } catch {
      return requestAIResponse({ model, messages, temperature, stream: false });
    }
  } else {
    const response = await fetch(`${apiUrl}/chat-completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ model, messages, temperature, stream: false })
    });

    if (!response.ok) {
      let errorMessage = 'Unable to reach the AI service.';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // use default
      }
      throw new Error(errorMessage);
    }

    const data: AIProviderResponse = await response.json();

    if (!data || typeof data.content !== 'string' || !data.content.trim()) {
      throw new Error('The AI service returned an empty response.');
    }

    return data.content.trim();
  }
};
