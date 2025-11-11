import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type Role = 'system' | 'user' | 'assistant';

interface CanvasMessage {
  role: Role;
  content: string;
}

interface ChatCompletionPayload {
  model: string;
  messages: CanvasMessage[];
  temperature?: number;
  stream?: boolean;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const ensureKey = (key: string | undefined, name: string) => {
  if (!key) {
    throw new Error(`Missing ${name}. Set it with \`supabase functions secrets set ${name}=<value>\`.`);
  }
  return key;
};

const callOpenAI = async (model: string, messages: CanvasMessage[], temperature: number, stream: boolean = false) => {
  const apiKey = ensureKey(OPENAI_API_KEY, 'OPENAI_API_KEY');

  const formatted = messages.map((message) => ({
    role: message.role,
    content: message.content
  }));

  if (stream) {
    // For streaming, use OpenAI's chat completions endpoint
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model.replace('gpt-4o', 'gpt-4o').replace('gpt-4', 'gpt-4'),
        messages: formatted,
        temperature,
        max_tokens: 1024,
        stream: true
      })
    });

    if (!response.ok) {
      let errorMessage = 'OpenAI request failed';
      try {
        const error = await response.json();
        errorMessage = error?.error?.message ?? errorMessage;
      } catch {
        const errorText = await response.text().catch(() => '');
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response;
  }

  // Non-streaming fallback
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: formatted,
      temperature,
      max_output_tokens: 1024
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message ?? 'OpenAI request failed';
    throw new Error(message);
  }

  const outputText = typeof data?.output_text === 'string' ? data.output_text : '';

  if (outputText.trim()) {
    return outputText.trim();
  }

  const fallback = Array.isArray(data?.output)
    ? data.output
        .flatMap((item: { content?: Array<{ type: string; text?: { value?: string } | string }> }) =>
          Array.isArray(item.content)
            ? item.content
                .filter((part) => part.type === 'output_text' || part.type === 'text')
                .map((part) =>
                  typeof part.text === 'string'
                    ? part.text
                    : part.text?.value ?? ''
                )
            : []
        )
        .join('')
        .trim()
    : '';

  if (!fallback) {
    throw new Error('OpenAI returned an empty response');
  }

  return fallback;
};

const callAnthropic = async (model: string, messages: CanvasMessage[], temperature: number, stream: boolean = false) => {
  const apiKey = ensureKey(ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY');

  const systemMessages: string[] = [];
  const conversation = [] as Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }>;

  for (const message of messages) {
    if (message.role === 'system') {
      systemMessages.push(message.content);
      continue;
    }

    if (conversation.length === 0 && message.role === 'assistant') {
      systemMessages.push(message.content);
      continue;
    }

    conversation.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'text', text: message.content }]
    });
  }

  if (conversation.length === 0) {
    throw new Error('No user messages provided for Claude');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      messages: conversation,
      max_tokens: 1024,
      temperature,
      system: systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined,
      stream: stream
    })
  });

  if (!response.ok) {
    let errorMessage = 'Anthropic request failed';
    try {
      const data = await response.json();
      errorMessage = data?.error?.message ?? errorMessage;
    } catch {
      const errorText = await response.text().catch(() => '');
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (stream) {
    return response;
  }

  const data = await response.json();

  const text = Array.isArray(data?.content)
    ? data.content
        .filter((item: { type?: string }) => item.type === 'text' && typeof item.text === 'string')
        .map((item: { text: string }) => item.text)
        .join('')
        .trim()
    : '';

  if (!text) {
    throw new Error('Anthropic returned an empty response');
  }

  return text;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  let payload: ChatCompletionPayload;

  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const { model, messages, temperature = 0.7, stream = true } = payload;

  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Model and messages are required.' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  try {
    const provider = model.startsWith('claude') ? 'anthropic' : 'openai';
    
    if (stream) {
      let aiResponse: Response;
      try {
        aiResponse = provider === 'anthropic'
          ? await callAnthropic(model, messages, temperature, true)
          : await callOpenAI(model, messages, temperature, true);
      } catch (apiError) {
        throw apiError;
      }

      if (!(aiResponse instanceof Response)) {
        throw new Error('Streaming response expected');
      }

      // Create a streaming response
      const stream = new ReadableStream({
        async start(controller) {
          const reader = aiResponse.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
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
                  if (data === '[DONE]') {
                    controller.close();
                    return;
                  }

                  try {
                    const parsed = JSON.parse(data);
                    let chunk = '';

                    if (provider === 'anthropic') {
                      // Anthropic SSE format
                      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                        chunk = parsed.delta.text || '';
                      } else if (parsed.type === 'message_stop') {
                        controller.close();
                        return;
                      }
                    } else {
                      // OpenAI SSE format
                      if (parsed.choices?.[0]?.delta?.content) {
                        chunk = parsed.choices[0].delta.content;
                      } else if (parsed.choices?.[0]?.finish_reason) {
                        controller.close();
                        return;
                      }
                    }

                    if (chunk) {
                      const encoded = new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`);
                      controller.enqueue(encoded);
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }
          } catch (error) {
            controller.error(error);
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      // Non-streaming fallback
      const content = provider === 'anthropic'
        ? await callAnthropic(model, messages, temperature, false)
        : await callOpenAI(model, messages, temperature, false);

      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
};

serve(handler);
