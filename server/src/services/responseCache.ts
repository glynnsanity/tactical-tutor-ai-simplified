/**
 * Response Cache (Quick Win #4)
 *
 * Caches grounded LLM responses to avoid redundant calls for identical questions.
 * Cache key includes question + game count to ensure staleness detection.
 */

interface CachedResponse {
  response: string;
  timestamp: number;
  gameCount: number;
}

// In-memory cache
const cache: Map<string, CachedResponse> = new Map();

// Cache settings
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Normalize a question for cache key generation
 */
function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[?!.,;:'\"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate cache key from question and game count
 */
function getCacheKey(question: string, gameCount: number): string {
  return `${normalizeQuestion(question)}:${gameCount}`;
}

/**
 * Get cached response if available and fresh
 */
export function getCachedResponse(
  question: string,
  gameCount: number
): string | null {
  const key = getCacheKey(question, gameCount);
  const cached = cache.get(key);

  if (!cached) {
    return null;
  }

  // Check TTL
  if (Date.now() - cached.timestamp >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  // Check game count matches (invalidate if new games added)
  if (cached.gameCount !== gameCount) {
    cache.delete(key);
    return null;
  }

  console.log(`[ResponseCache] Cache hit for: "${question.substring(0, 40)}..."`);
  return cached.response;
}

/**
 * Cache a response
 */
export function cacheResponse(
  question: string,
  gameCount: number,
  response: string
): void {
  const key = getCacheKey(question, gameCount);

  // Enforce cache size limit
  if (cache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entries
    const entries = [...cache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 4));
    for (const [oldKey] of toRemove) {
      cache.delete(oldKey);
    }
  }

  cache.set(key, {
    response,
    timestamp: Date.now(),
    gameCount,
  });

  console.log(`[ResponseCache] Cached response for: "${question.substring(0, 40)}..."`);
}

/**
 * Clear the response cache
 */
export function clearResponseCache(): void {
  cache.clear();
  console.log('[ResponseCache] Cache cleared');
}

/**
 * Get cache stats for debugging
 */
export function getResponseCacheStats(): {
  size: number;
  oldestEntry: number | null;
} {
  if (cache.size === 0) {
    return { size: 0, oldestEntry: null };
  }

  const oldest = Math.min(...[...cache.values()].map((c) => c.timestamp));
  return { size: cache.size, oldestEntry: Date.now() - oldest };
}
