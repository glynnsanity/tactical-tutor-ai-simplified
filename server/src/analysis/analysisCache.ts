/**
 * Analysis Result Cache
 *
 * Caches computed analysis results to avoid recomputation.
 * Results are keyed by userId + filter + depth.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { AnalysisResult, AnalysisDepth } from './interactiveAnalysis';

const DATA_ROOT = path.join(process.cwd(), 'data');

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  result: AnalysisResult;
  createdAt: string;
  gameCount: number;  // To invalidate when games change
  filter: {
    opening?: string;
    timeControl?: string;
  };
}

/**
 * Full cache structure for a user
 */
interface UserAnalysisCache {
  userId: string;
  entries: Record<string, CacheEntry>;  // Keyed by cacheKey
}

/**
 * Generate cache key from filter and depth
 */
function generateCacheKey(
  filter: { opening?: string; timeControl?: string },
  depth: AnalysisDepth
): string {
  const parts = [
    depth,
    filter.opening || 'all',
    filter.timeControl || 'all',
  ];
  return parts.join(':').toLowerCase();
}

/**
 * Get cache file path for user
 */
function cachePath(userId: string): string {
  return path.join(DATA_ROOT, userId, 'analysis-cache.json');
}

/**
 * Load cache from disk
 */
async function loadCache(userId: string): Promise<UserAnalysisCache> {
  const file = cachePath(userId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as UserAnalysisCache;
  } catch (err: any) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') {
      return { userId, entries: {} };
    }
    console.error('[AnalysisCache] Failed to load cache:', err);
    return { userId, entries: {} };
  }
}

/**
 * Save cache to disk
 */
async function saveCache(userId: string, cache: UserAnalysisCache): Promise<void> {
  const dir = path.join(DATA_ROOT, userId);
  await fs.mkdir(dir, { recursive: true });

  const file = cachePath(userId);
  await fs.writeFile(file, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * Get cached analysis result if available and valid
 */
export async function getCachedAnalysis(
  userId: string,
  filter: { opening?: string; timeControl?: string },
  depth: AnalysisDepth,
  currentGameCount: number,
  maxAgeMs: number = 60 * 60 * 1000  // 1 hour default TTL
): Promise<AnalysisResult | null> {
  const cache = await loadCache(userId);
  const key = generateCacheKey(filter, depth);
  const entry = cache.entries[key];

  if (!entry) {
    console.log(`[AnalysisCache] Miss: no entry for ${key}`);
    return null;
  }

  // Check if game count changed (invalidate if new games added)
  if (entry.gameCount !== currentGameCount) {
    console.log(`[AnalysisCache] Miss: game count changed (${entry.gameCount} -> ${currentGameCount})`);
    return null;
  }

  // Check TTL
  const age = Date.now() - new Date(entry.createdAt).getTime();
  if (age > maxAgeMs) {
    console.log(`[AnalysisCache] Miss: entry expired (${Math.round(age / 60000)}min old)`);
    return null;
  }

  console.log(`[AnalysisCache] Hit: ${key} (${Math.round(age / 60000)}min old)`);
  return entry.result;
}

/**
 * Store analysis result in cache
 */
export async function setCachedAnalysis(
  userId: string,
  filter: { opening?: string; timeControl?: string },
  depth: AnalysisDepth,
  result: AnalysisResult,
  currentGameCount: number
): Promise<void> {
  const cache = await loadCache(userId);
  const key = generateCacheKey(filter, depth);

  cache.entries[key] = {
    result,
    createdAt: new Date().toISOString(),
    gameCount: currentGameCount,
    filter,
  };

  // Prune old entries (keep max 20)
  const entries = Object.entries(cache.entries);
  if (entries.length > 20) {
    // Sort by createdAt and keep newest 20
    entries.sort((a, b) =>
      new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime()
    );
    cache.entries = Object.fromEntries(entries.slice(0, 20));
  }

  await saveCache(userId, cache);
  console.log(`[AnalysisCache] Stored: ${key}`);
}

/**
 * Clear all cached analysis for a user
 * Call this when games are re-ingested
 */
export async function clearAnalysisCache(userId: string): Promise<void> {
  const file = cachePath(userId);
  try {
    await fs.unlink(file);
    console.log(`[AnalysisCache] Cleared cache for ${userId}`);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error('[AnalysisCache] Failed to clear cache:', err);
    }
  }
}

/**
 * Get cache stats for debugging
 */
export async function getCacheStats(userId: string): Promise<{
  entryCount: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}> {
  const cache = await loadCache(userId);
  const entries = Object.values(cache.entries);

  if (entries.length === 0) {
    return { entryCount: 0, oldestEntry: null, newestEntry: null };
  }

  const sorted = entries.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return {
    entryCount: entries.length,
    oldestEntry: sorted[0].createdAt,
    newestEntry: sorted[sorted.length - 1].createdAt,
  };
}
