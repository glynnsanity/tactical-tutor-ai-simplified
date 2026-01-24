/**
 * Intent Cache
 *
 * Caches intent analysis results to avoid redundant LLM calls for similar questions.
 * Uses fuzzy matching to find semantically similar cached questions.
 */

import type { IntentAnalysis } from './intentAnalyzer';

interface CachedIntent {
  question: string;
  normalizedQuestion: string;
  intent: IntentAnalysis;
  timestamp: number;
}

// In-memory cache (could be moved to Redis/file for persistence)
const cache: Map<string, CachedIntent> = new Map();

// Cache settings
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Normalize a question for comparison
 * Removes punctuation, lowercases, and normalizes whitespace
 */
function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[?!.,;:'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between two normalized questions
 * Uses word overlap (Jaccard similarity)
 */
function calculateSimilarity(q1: string, q2: string): number {
  const words1 = new Set(q1.split(' '));
  const words2 = new Set(q2.split(' '));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Find a cached intent for a similar question
 */
export function getCachedIntent(question: string): IntentAnalysis | null {
  const normalized = normalizeQuestion(question);
  const now = Date.now();

  // First, check for exact match
  const exactMatch = cache.get(normalized);
  if (exactMatch && now - exactMatch.timestamp < CACHE_TTL_MS) {
    console.log('[IntentCache] Exact match found');
    return exactMatch.intent;
  }

  // Then, check for similar questions (threshold: 0.7 similarity)
  for (const [key, cached] of cache.entries()) {
    // Skip expired entries
    if (now - cached.timestamp >= CACHE_TTL_MS) {
      cache.delete(key);
      continue;
    }

    const similarity = calculateSimilarity(normalized, cached.normalizedQuestion);
    if (similarity >= 0.7) {
      console.log(`[IntentCache] Similar match found (similarity: ${similarity.toFixed(2)})`);
      return cached.intent;
    }
  }

  return null;
}

/**
 * Cache an intent analysis result
 */
export function cacheIntent(question: string, intent: IntentAnalysis): void {
  const normalized = normalizeQuestion(question);

  // Enforce cache size limit
  if (cache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entries
    const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 4));
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }

  cache.set(normalized, {
    question,
    normalizedQuestion: normalized,
    intent,
    timestamp: Date.now(),
  });

  console.log(`[IntentCache] Cached intent for: "${question.substring(0, 50)}..."`);
}

/**
 * Clear the intent cache
 */
export function clearIntentCache(): void {
  cache.clear();
  console.log('[IntentCache] Cache cleared');
}

/**
 * Get cache stats for debugging
 */
export function getIntentCacheStats(): { size: number; oldestEntry: number | null } {
  if (cache.size === 0) {
    return { size: 0, oldestEntry: null };
  }

  const oldest = Math.min(...[...cache.values()].map(c => c.timestamp));
  return { size: cache.size, oldestEntry: Date.now() - oldest };
}
