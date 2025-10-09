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

const callOpenAI = async (model: string, messages: CanvasMessage[], temperature: number) => {
  const apiKey = ensureKey(OPENAI_API_KEY, 'OPENAI_API_KEY');

  const formatted = messages.map((message) => ({
    role: message.role,
    content: message.content
  }));

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

const callAnthropic = async (model: string, messages: CanvasMessage[], temperature: number) => {
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
      system: systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message ?? 'Anthropic request failed';
    throw new Error(message);
  }

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

  const { model, messages, temperature = 0.7 } = payload;

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
    const content =
      provider === 'anthropic'
        ? await callAnthropic(model, messages, temperature)
        : await callOpenAI(model, messages, temperature);

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('chat-completion error', message);

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
