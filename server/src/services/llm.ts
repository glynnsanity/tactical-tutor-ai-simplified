import { env } from './env';

export type StreamOpts = {
  system: string;
  user: string;
  onToken: (t: string) => void;
  onDone?: () => void;
  maxTokens?: number;
  temperature?: number;
};

export async function streamAnswer(opts: StreamOpts): Promise<void> {
  const { system, user, onToken, onDone } = opts;

  if (!env.OPENAI_API_KEY) {
    await mockStream(system, user, onToken, onDone);
    return;
  }

  // Provider-backed streaming (OpenAI-compatible)
  // Note: Kept minimal; swap to official SDK later if desired.
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
    temperature: opts.temperature ?? 0.7,
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


