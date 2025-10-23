// Minimal fake streaming helper to simulate a coach assistant reply.
// Consumers can pass onToken to receive incremental chunks and onDone when finished.
import { Platform } from 'react-native';

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onDone?: () => void;
};

export type StreamControls = {
  cancel: () => void;
};

const DEFAULT_REPLY =
  "Let's look at this together. Consider central control, king safety, and piece activity. Often, improving your worst-placed piece and asking what your opponent wants can reveal strong candidate moves.";

// Simulates token streaming using setInterval. Returns controls to cancel.
export function fakeStreamCoachReply(prompt: string, callbacks: StreamCallbacks, tokenMs = 30): StreamControls {
  // Basic variation so it doesn't feel identical every time
  const seeded = `${DEFAULT_REPLY} ${prompt ? '\n\nRelated to your question: ' + summarizePrompt(prompt) : ''}`.trim();
  const tokens = tokenize(seeded);

  let idx = 0;
  const interval = setInterval(() => {
    if (idx >= tokens.length) {
      clearInterval(interval);
      callbacks.onDone && callbacks.onDone();
      return;
    }
    callbacks.onToken(tokens[idx]);
    idx += 1;
  }, tokenMs);

  return {
    cancel: () => clearInterval(interval),
  };
}

function tokenize(text: string): string[] {
  // Split by small chunks to simulate tokens; keep spaces/punctuation attached reasonably.
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const piece = words[i];
    if (!piece) continue;
    // Emit small chunks, sometimes merging a word with following space for smoother feel
    if (piece.match(/^\s+$/)) {
      chunks.push(piece);
    } else if (piece.length <= 6) {
      chunks.push(piece);
    } else {
      // Break long words
      for (let j = 0; j < piece.length; j += 5) {
        chunks.push(piece.slice(j, j + 5));
      }
    }
  }
  return chunks;
}

function summarizePrompt(prompt: string): string {
  // Super naive summary: take first sentence up to ~80 chars
  const trimmed = prompt.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 77) + '...';
}


// --- Server helpers: ask and poll ---

export type AskResponse = { jobId: string };
export type PollResponse = { tokens: string[]; nextCursor: number; done: boolean };

let apiBaseUrlOverride: string | null = null;

export function setApiBaseUrl(url: string) {
  apiBaseUrlOverride = url;
}

function getApiBaseUrl(): string {
  if (apiBaseUrlOverride) return apiBaseUrlOverride;
  if (Platform.OS === 'android') return 'http://10.0.2.2:8787';
  return 'http://localhost:8787';
}

export async function ask(question: string, userId?: string): Promise<AskResponse> {
  const res = await fetch(`${getApiBaseUrl()}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, userId }),
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`ask failed: ${res.status} ${text}`);
  }
  return (await res.json()) as AskResponse;
}

export async function poll(jobId: string, cursor: number): Promise<PollResponse> {
  const url = `${getApiBaseUrl()}/poll?jobId=${encodeURIComponent(jobId)}&cursor=${encodeURIComponent(String(cursor))}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`poll failed: ${res.status} ${text}`);
  }
  return (await res.json()) as PollResponse;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}


