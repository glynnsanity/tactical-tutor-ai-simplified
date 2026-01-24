import { env } from './env';

export type StreamOpts = {
  system: string;
  user: string;
  onToken: (t: string) => void;
  onDone?: () => void;
  maxTokens?: number;
  temperature?: number;
  model?: 'haiku' | 'sonnet' | 'default';  // Model selection for cascading
};

export async function streamAnswer(opts: StreamOpts): Promise<void> {
  const { system, user, onToken, onDone } = opts;

  // Prefer Anthropic if available, otherwise fall back to OpenAI
  if (env.ANTHROPIC_API_KEY) {
    await streamAnthropic(opts);
    return;
  }

  if (env.OPENAI_API_KEY) {
    await streamOpenAI(opts);
    return;
  }

  // No API key - use mock
  await mockStream(system, user, onToken, onDone);
}

/**
 * Stream from Anthropic's Claude API
 */
async function streamAnthropic(opts: StreamOpts): Promise<void> {
  const { system, user, onToken, onDone } = opts;

  const url = 'https://api.anthropic.com/v1/messages';

  // Build messages - if user is empty, put system content as user message
  const messages = user.trim()
    ? [{ role: 'user', content: user }]
    : [{ role: 'user', content: 'Please respond based on the system instructions.' }];

  // Model cascading: use Haiku for fast/cheap tasks, Sonnet for complex
  let modelName: string;
  switch (opts.model) {
    case 'haiku':
      modelName = 'claude-3-5-haiku-20241022';  // Fast, cheap - good for classification
      break;
    case 'sonnet':
      modelName = 'claude-sonnet-4-20250514';   // Balanced - good for coaching
      break;
    default:
      modelName = env.MODEL_NAME || 'claude-sonnet-4-20250514';
  }

  const body = {
    model: modelName,
    max_tokens: opts.maxTokens ?? env.MAX_TOKENS ?? 1024,
    system: system,
    messages: messages,
    stream: true,
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': env.ANTHROPIC_API_KEY!,
    'anthropic-version': '2023-06-01',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await safeText(res);
    throw new Error(`LLM request failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let done = false;

  try {
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      const chunk = decoder.decode(value, { stream: true });

      // Parse server-sent events
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();

        if (payload === '[DONE]') {
          done = true;
          break;
        }

        try {
          const json = JSON.parse(payload);

          // Handle Anthropic's event types
          if (json.type === 'content_block_delta') {
            const delta = json.delta?.text ?? '';
            if (typeof delta === 'string' && delta.length > 0) {
              onToken(delta);
            }
          } else if (json.type === 'message_stop') {
            done = true;
            break;
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
  } finally {
    onDone && onDone();
  }
}

/**
 * Stream from OpenAI-compatible API
 */
async function streamOpenAI(opts: StreamOpts): Promise<void> {
  const { system, user, onToken, onDone } = opts;

  const controller = new AbortController();
  const base = env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com/v1';
  const url = `${base}/chat/completions`;
  const body = {
    model: env.MODEL_NAME,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    stream: true,
    max_tokens: opts.maxTokens ?? env.MAX_TOKENS ?? 1024,
    temperature: opts.temperature ?? 0.3,
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${env.OPENAI_API_KEY}`,
  };
  if (env.OPENAI_ORG_ID) headers['OpenAI-Organization'] = env.OPENAI_ORG_ID;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!res.ok || !res.body) {
    const text = await safeText(res);
    throw new Error(`LLM request failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  try {
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      const chunk = decoder.decode(value, { stream: true });
      // Parse server-sent events format: lines starting with 'data: '
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          done = true;
          break;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content ?? '';
          if (typeof delta === 'string' && delta.length > 0) {
            onToken(delta);
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
  } catch (err) {
    controller.abort();
    throw err;
  } finally {
    onDone && onDone();
  }
}

export async function mockStream(system: string, user: string, onToken: (t: string) => void, onDone?: () => void) {
  const text = mockAnswer(system, user);
  // Simulate streaming by breaking into word-sized chunks
  const words = text.split(/(\s+)/).filter(Boolean);
  for (const word of words) {
    await delay(30);
    onToken(word);
  }
  onDone && onDone();
}

function mockAnswer(system: string, user: string): string {
  const summary = user.trim().slice(0, 120);
  return `Here is a quick thought: focus on central control, king safety, and improving your worst-placed piece. Related: ${summary}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
