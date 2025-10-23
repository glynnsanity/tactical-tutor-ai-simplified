import { appendTokens, markDone } from './registry';
import { streamAnswer } from '../services/llm';

export function startFakeStream(jobId: string, text: string, intervalMs = 120): () => void {
  // Backward-compatible helper still used by /ask. If an API key exists, stream via LLM;
  // otherwise simulate locally using the same interface.
  let cancelled = false;
  (async () => {
    try {
      await streamAnswer({
        system: 'You are a helpful chess coach.',
        user: text,
        onToken: (t) => {
          if (cancelled) return;
          const parts = t.split(/\s+/).filter(Boolean);
          if (parts.length > 0) appendTokens(jobId, parts);
        },
        onDone: () => {
          if (cancelled) return;
          markDone(jobId);
        },
      });
    } catch (e) {
      if (!cancelled) markDone(jobId);
    }
  })();

  return () => {
    cancelled = true;
  };
}


