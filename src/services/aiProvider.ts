import { supabase } from '../lib/supabaseClient';
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

export const requestAIResponse = async ({
  model,
  messages,
  temperature = 0.7,
  stream = true,
  onChunk
}: AIRequest): Promise<string> => {
  if (stream && onChunk) {
    // Streaming mode - use fetch directly to handle the stream
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const session = await supabase.auth.getSession();
    
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/chat-completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session?.access_token ?? supabaseAnonKey}`,
          apikey: supabaseAnonKey ?? ''
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          stream: true
        })
      });

      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Unable to reach the AI service.';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If response is not JSON, try text
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch {
            // Use default error message
          }
        }
        throw new Error(errorMessage);
      }

      // Check if response is actually a stream
      const contentType = response.headers.get('content-type') || '';
      
      // Some servers might return 'text/plain' or 'application/json' even for streams
      // So we'll try to read it as a stream first, and only fall back if we can't
      if (contentType.includes('application/json') && !contentType.includes('stream')) {
        // If it's explicitly JSON (not a stream), check if it's an error or a non-streaming response
        const jsonData = await response.json();
        
        // Check if it's an error response
        if (jsonData.error) {
          throw new Error(jsonData.error);
        }
        
        // If it's a non-streaming response with content, return it directly
        if (jsonData.content) {
          // Call onChunk with the full content for consistency
          if (onChunk) {
            onChunk(jsonData.content);
          }
          return jsonData.content;
        }
        
        // Otherwise, fall back to non-streaming mode
        return requestAIResponse({
          model,
          messages,
          temperature,
          stream: false,
          onChunk: undefined
        });
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming not supported');
      }

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return fullContent || ' ';
              }

              try {
                const parsed: StreamChunk = JSON.parse(data);
                if (parsed.chunk) {
                  fullContent += parsed.chunk;
                  onChunk(parsed.chunk);
                }
              } catch (e) {
                // Skip invalid JSON - might be an error message
              }
            } else if (line.startsWith('event: ') || line.startsWith('id: ')) {
              // Skip SSE metadata lines
              continue;
            }
          }
        }
      } catch (error) {
        throw error;
      } finally {
        reader.releaseLock();
      }

      // Return at least a space if we got no content (to prevent empty message)
      return fullContent || ' ';
    } catch (error) {
      // Fallback to non-streaming mode on error
      return requestAIResponse({
        model,
        messages,
        temperature,
        stream: false,
        onChunk: undefined
      });
    }
  } else {
    // Non-streaming mode
    const { data, error } = await supabase.functions.invoke<AIProviderResponse>('chat-completion', {
      body: {
        model,
        messages,
        temperature,
        stream: false
      }
    });

    if (error) {
      throw new Error(error.message ?? 'Unable to reach the AI service.');
    }

    if (!data || typeof data.content !== 'string' || !data.content.trim()) {
      throw new Error('The AI service returned an empty response.');
    }

    return data.content.trim();
  }
};
