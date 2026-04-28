import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { stream } from 'hono/streaming';

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

const POCKETBASE_URL = process.env.POCKETBASE_URL ?? 'http://localhost:8090';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

const ensureKey = (key: string | undefined, name: string): string => {
  if (!key) throw new Error(`Missing environment variable: ${name}`);
  return key;
};

// Validate a PocketBase auth token via the auth-refresh endpoint
async function validateToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

const callOpenAI = async (
  model: string,
  messages: CanvasMessage[],
  temperature: number,
  stream: boolean
): Promise<Response | string> => {
  const apiKey = ensureKey(OPENAI_API_KEY, 'OPENAI_API_KEY');

  const formatted = messages.map((m) => ({ role: m.role, content: m.content }));

  if (stream) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: formatted, temperature, max_tokens: 1024, stream: true })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error?.message ?? 'OpenAI request failed');
    }

    return response;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: formatted, temperature, max_output_tokens: 1024 })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? 'OpenAI request failed');
  }

  const outputText = typeof data?.output_text === 'string' ? data.output_text.trim() : '';
  if (outputText) return outputText;

  const fallback = Array.isArray(data?.output)
    ? data.output
        .flatMap((item: { content?: Array<{ type: string; text?: { value?: string } | string }> }) =>
          Array.isArray(item.content)
            ? item.content
                .filter((p) => p.type === 'output_text' || p.type === 'text')
                .map((p) => (typeof p.text === 'string' ? p.text : (p.text as { value?: string })?.value ?? ''))
            : []
        )
        .join('')
        .trim()
    : '';

  if (!fallback) throw new Error('OpenAI returned an empty response');
  return fallback;
};

const callAnthropic = async (
  model: string,
  messages: CanvasMessage[],
  temperature: number,
  stream: boolean
): Promise<Response | string> => {
  const apiKey = ensureKey(ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY');

  const systemMessages: string[] = [];
  const conversation: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }> = [];

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

  if (conversation.length === 0) throw new Error('No user messages provided for Claude');

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
      stream
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? 'Anthropic request failed');
  }

  if (stream) return response;

  const data = await response.json();
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((item: { type?: string; text?: string }) => item.type === 'text' && typeof item.text === 'string')
        .map((item: { text: string }) => item.text)
        .join('')
        .trim()
    : '';

  if (!text) throw new Error('Anthropic returned an empty response');
  return text;
};


const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ALLOWED_ORIGIN,
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization']
  })
);

app.get('/health', (c) => c.json({ ok: true }));

app.post('/chat-completion', async (c) => {
  // Validate auth token
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const isValid = await validateToken(token);
  if (!isValid) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let payload: ChatCompletionPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const { model, messages, temperature = 0.7, stream: shouldStream = true } = payload;

  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'model and messages are required' }, 400);
  }

  const provider = model.startsWith('claude') ? 'anthropic' : 'openai';

  try {
    if (shouldStream) {
      const aiResponse =
        provider === 'anthropic'
          ? await callAnthropic(model, messages, temperature, true)
          : await callOpenAI(model, messages, temperature, true);

      if (!(aiResponse instanceof Response)) {
        throw new Error('Expected streaming response from AI provider');
      }

      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');

      return stream(c, async (s) => {
        const reader = aiResponse.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.trim() === '') continue;
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') return;

              try {
                const parsed = JSON.parse(data);
                let chunk = '';

                if (provider === 'anthropic') {
                  if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                    chunk = parsed.delta.text ?? '';
                  } else if (parsed.type === 'message_stop') {
                    return;
                  }
                } else {
                  if (parsed.choices?.[0]?.delta?.content) {
                    chunk = parsed.choices[0].delta.content;
                  } else if (parsed.choices?.[0]?.finish_reason) {
                    return;
                  }
                }

                if (chunk) {
                  await s.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                }
              } catch {
                // skip invalid JSON
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      });
    } else {
      const content =
        provider === 'anthropic'
          ? await callAnthropic(model, messages, temperature, false)
          : await callOpenAI(model, messages, temperature, false);

      if (content instanceof Response) throw new Error('Unexpected streaming response in non-stream mode');

      return c.json({ content });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[chat-completion error]', message, error);
    return c.json({ error: message }, 500);
  }
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Canvas GPT server running on port ${PORT}`);
});
