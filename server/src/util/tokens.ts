// Split a text chunk into "wordish" tokens suitable for UI streaming.
// - Simple word-based tokenization
// - Preserve basic spacing

export function splitToWordishTokens(chunk: string): string[] {
  if (!chunk) return [];
  const normalized = chunk.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const parts = normalized.split(' ').filter(Boolean);
  return parts;
}


