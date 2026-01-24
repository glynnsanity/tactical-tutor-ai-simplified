/**
 * Historical Statistics Schema
 *
 * Compact aggregated stats for all-time data without storing individual games.
 * Enables answering questions like "How have I performed in Evans Gambit over time?"
 * without loading thousands of game summaries.
 */

import { z } from 'zod';

/**
 * Stats for a single time period (month or quarter)
 */
export const PeriodStats = z.object({
  period: z.string(),               // "2024-Q1" or "2024-01"
  gamesPlayed: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  winRate: z.number(),
  avgRating: z.number().nullable(),
});

export type PeriodStatsT = z.infer<typeof PeriodStats>;

/**
 * Opening-specific historical stats
 */
export const OpeningHistory = z.object({
  name: z.string(),
  eco: z.string().nullable(),
  family: z.string().nullable(),

  // All-time totals
  allTime: z.object({
    gamesPlayed: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    winRate: z.number(),
    asWhite: z.number(),
    asBlack: z.number(),
  }),

  // Performance over time (quarterly)
  byPeriod: z.array(PeriodStats),

  // Trend analysis
  trend: z.enum(['improving', 'stable', 'declining', 'insufficient_data']),
  trendDescription: z.string().nullable(),

  // First and last played
  firstPlayed: z.string().nullable(),   // ISO date
  lastPlayed: z.string().nullable(),    // ISO date
});

export type OpeningHistoryT = z.infer<typeof OpeningHistory>;

/**
 * Time control historical stats
 */
export const TimeControlHistory = z.object({
  type: z.enum(['bullet', 'blitz', 'rapid', 'classical', 'daily']),

  allTime: z.object({
    gamesPlayed: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    winRate: z.number(),
  }),

  byPeriod: z.array(PeriodStats),
  trend: z.enum(['improving', 'stable', 'declining', 'insufficient_data']),
});

export type TimeControlHistoryT = z.infer<typeof TimeControlHistory>;

/**
 * Rating history tracking
 */
export const RatingHistory = z.object({
  timeControl: z.enum(['bullet', 'blitz', 'rapid', 'classical', 'daily']),

  // Snapshots at different points
  snapshots: z.array(z.object({
    date: z.string(),           // ISO date
    rating: z.number(),
    gamesAtThisPoint: z.number(),
  })),

  // Summary stats
  peak: z.object({
    rating: z.number(),
    date: z.string(),
  }).nullable(),

  lowest: z.object({
    rating: z.number(),
    date: z.string(),
  }).nullable(),

  current: z.number().nullable(),
});

export type RatingHistoryT = z.infer<typeof RatingHistory>;

/**
 * Complete Historical Statistics
 *
 * This is the "Tier 2" data - compact aggregates for all-time history.
 * Updated incrementally when new games are ingested.
 */
export const HistoricalStats = z.object({
  userId: z.string(),
  lastUpdated: z.string(),          // ISO timestamp

  // Overall lifetime stats
  lifetime: z.object({
    totalGames: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    winRate: z.number(),
    firstGame: z.string().nullable(),   // ISO date
    latestGame: z.string().nullable(),  // ISO date
  }),

  // Opening breakdown (all openings ever played)
  openings: z.array(OpeningHistory),

  // Time control breakdown
  timeControls: z.array(TimeControlHistory),

  // Rating progression
  ratingHistory: z.array(RatingHistory),

  // Monthly activity (for "when do I play most" questions)
  activityByMonth: z.array(z.object({
    month: z.string(),            // "2024-01"
    gamesPlayed: z.number(),
    winRate: z.number(),
  })),

  // Day of week patterns (for curiosity questions)
  activityByDayOfWeek: z.array(z.object({
    dayOfWeek: z.number(),        // 0=Sunday, 6=Saturday
    gamesPlayed: z.number(),
    winRate: z.number(),
  })),
});

export type HistoricalStatsT = z.infer<typeof HistoricalStats>;

/**
 * Calculate trend from period stats
 */
export function calculateTrend(periods: PeriodStatsT[]): 'improving' | 'stable' | 'declining' | 'insufficient_data' {
  if (periods.length < 3) return 'insufficient_data';

  // Compare last 3 periods
  const recent = periods.slice(-3);
  const winRates = recent.map(p => p.winRate);

  // Calculate average change
  const changes: number[] = [];
  for (let i = 1; i < winRates.length; i++) {
    changes.push(winRates[i] - winRates[i - 1]);
  }
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;

  if (avgChange > 5) return 'improving';
  if (avgChange < -5) return 'declining';
  return 'stable';
}

/**
 * Get quarter string from date
 */
export function getQuarter(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${q}`;
}

/**
 * Get month string from date
 */
export function getMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
