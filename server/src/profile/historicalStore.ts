/**
 * Historical Statistics Storage
 *
 * Persists aggregated historical stats for fast retrieval.
 * Updated when new games are ingested.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { HistoricalStats, type HistoricalStatsT } from './historicalStats';
import { generateHistoricalStats } from './historicalGenerator';
import type { CompactGameSummaryT } from '../summaries/schemas';

const DATA_ROOT = path.join(process.cwd(), 'data');

function historicalPath(userId: string): string {
  return path.join(DATA_ROOT, userId, 'historical.json');
}

/**
 * Load historical stats from disk
 */
export async function loadHistoricalStats(userId: string): Promise<HistoricalStatsT | null> {
  const file = historicalPath(userId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    return HistoricalStats.parse(data);
  } catch (err: any) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return null;
    console.error('[HistoricalStore] Failed to load stats:', err);
    return null;
  }
}

/**
 * Save historical stats to disk
 */
export async function saveHistoricalStats(userId: string, stats: HistoricalStatsT): Promise<void> {
  const dir = path.join(DATA_ROOT, userId);
  await fs.mkdir(dir, { recursive: true });

  const validated = HistoricalStats.parse(stats);
  const file = historicalPath(userId);
  await fs.writeFile(file, JSON.stringify(validated, null, 2), 'utf8');
}

/**
 * Regenerate historical stats from game summaries
 */
export async function regenerateHistoricalStats(
  userId: string,
  summaries: CompactGameSummaryT[]
): Promise<HistoricalStatsT> {
  console.log(`[HistoricalStore] Regenerating historical stats for ${userId} with ${summaries.length} games`);

  const stats = generateHistoricalStats(userId, summaries);
  await saveHistoricalStats(userId, stats);

  console.log(`[HistoricalStore] Stats saved: ${stats.openings.length} openings tracked`);
  return stats;
}

/**
 * Get or generate historical stats
 */
export async function getOrGenerateHistoricalStats(
  userId: string,
  summaries: CompactGameSummaryT[],
  maxAgeMs: number = 24 * 60 * 60 * 1000 // 24 hours default
): Promise<HistoricalStatsT> {
  const existing = await loadHistoricalStats(userId);

  if (existing) {
    const age = Date.now() - new Date(existing.lastUpdated).getTime();

    // Use cached if recent AND game count matches
    if (age < maxAgeMs && existing.lifetime.totalGames === summaries.length) {
      console.log(`[HistoricalStore] Using cached stats (${Math.round(age / 60000)}min old)`);
      return existing;
    }
  }

  return regenerateHistoricalStats(userId, summaries);
}

/**
 * Query opening history
 */
export function queryOpeningHistory(
  stats: HistoricalStatsT,
  openingName: string
): HistoricalStatsT['openings'][0] | null {
  const normalized = openingName.toLowerCase();

  // Try exact match first
  let match = stats.openings.find(o =>
    o.name.toLowerCase() === normalized ||
    o.eco?.toLowerCase() === normalized
  );

  // Try partial match
  if (!match) {
    match = stats.openings.find(o =>
      o.name.toLowerCase().includes(normalized) ||
      (o.family && o.family.toLowerCase().includes(normalized))
    );
  }

  return match || null;
}

/**
 * Get summary for an opening query
 */
export function formatOpeningHistorySummary(
  opening: HistoricalStatsT['openings'][0]
): string {
  const lines: string[] = [];

  lines.push(`## ${opening.name} Performance\n`);
  lines.push(`**All-time:** ${opening.allTime.gamesPlayed} games`);
  lines.push(`**Record:** ${opening.allTime.wins}W - ${opening.allTime.losses}L - ${opening.allTime.draws}D (${opening.allTime.winRate}% win rate)`);
  lines.push(`**As White:** ${opening.allTime.asWhite} games | **As Black:** ${opening.allTime.asBlack} games`);

  if (opening.firstPlayed && opening.lastPlayed) {
    const first = new Date(opening.firstPlayed).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const last = new Date(opening.lastPlayed).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    lines.push(`**Period:** ${first} – ${last}`);
  }

  if (opening.trend !== 'insufficient_data') {
    lines.push(`\n**Trend:** ${opening.trend.charAt(0).toUpperCase() + opening.trend.slice(1)}`);
    if (opening.trendDescription) {
      lines.push(`*${opening.trendDescription}*`);
    }
  }

  if (opening.byPeriod.length > 0) {
    lines.push(`\n**Performance by Quarter:**`);
    for (const period of opening.byPeriod.slice(-6)) { // Last 6 quarters
      lines.push(`- ${period.period}: ${period.gamesPlayed} games, ${period.winRate}% win rate`);
    }
  }

  return lines.join('\n');
}
