/**
 * Historical Statistics Generator
 *
 * Processes all games to build compact aggregated statistics.
 * This enables answering historical questions without loading all game summaries.
 */

import type { CompactGameSummaryT } from '../summaries/schemas';
import { getFamilyForEco } from '../data/ecoDatabase';
import {
  type HistoricalStatsT,
  type OpeningHistoryT,
  type TimeControlHistoryT,
  type RatingHistoryT,
  type PeriodStatsT,
  calculateTrend,
  getQuarter,
  getMonth,
} from './historicalStats';

/**
 * Generate historical statistics from all games
 */
export function generateHistoricalStats(
  userId: string,
  games: CompactGameSummaryT[]
): HistoricalStatsT {
  if (games.length === 0) {
    return createEmptyHistoricalStats(userId);
  }

  // Sort games by date
  const sortedGames = [...games].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return {
    userId,
    lastUpdated: new Date().toISOString(),
    lifetime: computeLifetimeStats(sortedGames),
    openings: computeOpeningHistory(sortedGames),
    timeControls: computeTimeControlHistory(sortedGames),
    ratingHistory: computeRatingHistory(sortedGames),
    activityByMonth: computeMonthlyActivity(sortedGames),
    activityByDayOfWeek: computeDayOfWeekActivity(sortedGames),
  };
}

/**
 * Create empty stats for users with no games
 */
function createEmptyHistoricalStats(userId: string): HistoricalStatsT {
  return {
    userId,
    lastUpdated: new Date().toISOString(),
    lifetime: {
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      firstGame: null,
      latestGame: null,
    },
    openings: [],
    timeControls: [],
    ratingHistory: [],
    activityByMonth: [],
    activityByDayOfWeek: [],
  };
}

/**
 * Compute lifetime totals
 */
function computeLifetimeStats(games: CompactGameSummaryT[]) {
  const wins = games.filter(g => g.result === 'win' || g.result === 'checkmate').length;
  const losses = games.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
  const draws = games.filter(g => g.result === 'draw' || g.result === 'stalemate').length;
  const total = wins + losses + draws;

  return {
    totalGames: games.length,
    wins,
    losses,
    draws,
    winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
    firstGame: games[0]?.date || null,
    latestGame: games[games.length - 1]?.date || null,
  };
}

/**
 * Compute opening-specific history with trends over time
 */
function computeOpeningHistory(games: CompactGameSummaryT[]): OpeningHistoryT[] {
  // Group games by opening
  const openingMap = new Map<string, CompactGameSummaryT[]>();

  for (const game of games) {
    const name = game.opening?.name || 'Unknown';
    if (name === 'Unknown') continue;

    if (!openingMap.has(name)) {
      openingMap.set(name, []);
    }
    openingMap.get(name)!.push(game);
  }

  const results: OpeningHistoryT[] = [];

  for (const [name, openingGames] of Array.from(openingMap.entries())) {
    const eco = openingGames[0]?.opening?.eco || null;
    const family = eco ? getFamilyForEco(eco) : null;

    // All-time stats
    const wins = openingGames.filter(g => g.result === 'win' || g.result === 'checkmate').length;
    const losses = openingGames.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
    const draws = openingGames.filter(g => g.result === 'draw' || g.result === 'stalemate').length;
    const total = wins + losses + draws;

    // Period breakdown (quarterly)
    const byPeriod = computePeriodStats(openingGames, 'quarter');

    // Calculate trend
    const trend = calculateTrend(byPeriod);

    // Generate trend description
    let trendDescription: string | null = null;
    if (trend !== 'insufficient_data' && byPeriod.length >= 2) {
      const firstPeriod = byPeriod[0];
      const lastPeriod = byPeriod[byPeriod.length - 1];
      const diff = Math.round(lastPeriod.winRate - firstPeriod.winRate);
      if (Math.abs(diff) >= 10) {
        trendDescription = `Win rate ${diff > 0 ? 'improved' : 'declined'} by ${Math.abs(diff)}% from ${firstPeriod.period} to ${lastPeriod.period}`;
      }
    }

    // First and last played
    const sortedByDate = [...openingGames].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    results.push({
      name,
      eco,
      family,
      allTime: {
        gamesPlayed: openingGames.length,
        wins,
        losses,
        draws,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
        asWhite: openingGames.filter(g => g.userColor === 'white').length,
        asBlack: openingGames.filter(g => g.userColor === 'black').length,
      },
      byPeriod,
      trend,
      trendDescription,
      firstPlayed: sortedByDate[0]?.date || null,
      lastPlayed: sortedByDate[sortedByDate.length - 1]?.date || null,
    });
  }

  // Sort by total games played
  return results.sort((a, b) => b.allTime.gamesPlayed - a.allTime.gamesPlayed);
}

/**
 * Compute time control history
 */
function computeTimeControlHistory(games: CompactGameSummaryT[]): TimeControlHistoryT[] {
  const tcMap = new Map<string, CompactGameSummaryT[]>();

  for (const game of games) {
    const tc = game.timeControl.type;
    if (!tcMap.has(tc)) tcMap.set(tc, []);
    tcMap.get(tc)!.push(game);
  }

  const results: TimeControlHistoryT[] = [];

  for (const [type, tcGames] of Array.from(tcMap.entries())) {
    const wins = tcGames.filter(g => g.result === 'win' || g.result === 'checkmate').length;
    const losses = tcGames.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
    const draws = tcGames.filter(g => g.result === 'draw' || g.result === 'stalemate').length;
    const total = wins + losses + draws;

    const byPeriod = computePeriodStats(tcGames, 'quarter');

    results.push({
      type: type as TimeControlHistoryT['type'],
      allTime: {
        gamesPlayed: tcGames.length,
        wins,
        losses,
        draws,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      },
      byPeriod,
      trend: calculateTrend(byPeriod),
    });
  }

  return results.sort((a, b) => b.allTime.gamesPlayed - a.allTime.gamesPlayed);
}

/**
 * Compute rating history snapshots
 */
function computeRatingHistory(games: CompactGameSummaryT[]): RatingHistoryT[] {
  // Group by time control
  const tcMap = new Map<string, CompactGameSummaryT[]>();

  for (const game of games) {
    const tc = game.timeControl.type;
    if (game.userRating === null) continue;
    if (!tcMap.has(tc)) tcMap.set(tc, []);
    tcMap.get(tc)!.push(game);
  }

  const results: RatingHistoryT[] = [];

  for (const [type, tcGames] of Array.from(tcMap.entries())) {
    // Sort by date
    const sorted = [...tcGames].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Take monthly snapshots
    const snapshots: Array<{ date: string; rating: number; gamesAtThisPoint: number }> = [];
    const monthMap = new Map<string, { date: string; rating: number; count: number }>();

    for (let i = 0; i < sorted.length; i++) {
      const game = sorted[i];
      const month = getMonth(new Date(game.date));

      // Update month's last rating
      monthMap.set(month, {
        date: game.date,
        rating: game.userRating!,
        count: i + 1,
      });
    }

    // Convert to snapshots
    for (const [_, data] of Array.from(monthMap.entries())) {
      snapshots.push({
        date: data.date,
        rating: data.rating,
        gamesAtThisPoint: data.count,
      });
    }

    // Find peak and lowest
    let peak: { rating: number; date: string } | null = null;
    let lowest: { rating: number; date: string } | null = null;

    for (const snapshot of snapshots) {
      if (!peak || snapshot.rating > peak.rating) {
        peak = { rating: snapshot.rating, date: snapshot.date };
      }
      if (!lowest || snapshot.rating < lowest.rating) {
        lowest = { rating: snapshot.rating, date: snapshot.date };
      }
    }

    results.push({
      timeControl: type as RatingHistoryT['timeControl'],
      snapshots,
      peak,
      lowest,
      current: sorted[sorted.length - 1]?.userRating || null,
    });
  }

  return results;
}

/**
 * Compute period-based stats (monthly or quarterly)
 */
function computePeriodStats(
  games: CompactGameSummaryT[],
  granularity: 'month' | 'quarter'
): PeriodStatsT[] {
  const periodMap = new Map<string, CompactGameSummaryT[]>();

  for (const game of games) {
    const date = new Date(game.date);
    const period = granularity === 'quarter' ? getQuarter(date) : getMonth(date);

    if (!periodMap.has(period)) {
      periodMap.set(period, []);
    }
    periodMap.get(period)!.push(game);
  }

  const results: PeriodStatsT[] = [];

  for (const [period, periodGames] of Array.from(periodMap.entries())) {
    const wins = periodGames.filter(g => g.result === 'win' || g.result === 'checkmate').length;
    const losses = periodGames.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
    const draws = periodGames.filter(g => g.result === 'draw' || g.result === 'stalemate').length;
    const total = wins + losses + draws;

    // Average rating for the period
    const ratings = periodGames.map(g => g.userRating).filter((r): r is number => r !== null);
    const avgRating = ratings.length > 0
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
      : null;

    results.push({
      period,
      gamesPlayed: periodGames.length,
      wins,
      losses,
      draws,
      winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      avgRating,
    });
  }

  // Sort by period
  return results.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Compute monthly activity patterns
 */
function computeMonthlyActivity(games: CompactGameSummaryT[]) {
  const monthMap = new Map<string, CompactGameSummaryT[]>();

  for (const game of games) {
    const month = getMonth(new Date(game.date));
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(game);
  }

  const results: Array<{ month: string; gamesPlayed: number; winRate: number }> = [];

  for (const [month, monthGames] of Array.from(monthMap.entries())) {
    const wins = monthGames.filter(g => g.result === 'win' || g.result === 'checkmate').length;
    const total = monthGames.length;

    results.push({
      month,
      gamesPlayed: total,
      winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
    });
  }

  return results.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Compute day-of-week activity patterns
 */
function computeDayOfWeekActivity(games: CompactGameSummaryT[]) {
  const dayMap = new Map<number, CompactGameSummaryT[]>();

  for (const game of games) {
    const dayOfWeek = new Date(game.date).getDay();
    if (!dayMap.has(dayOfWeek)) dayMap.set(dayOfWeek, []);
    dayMap.get(dayOfWeek)!.push(game);
  }

  const results: Array<{ dayOfWeek: number; gamesPlayed: number; winRate: number }> = [];

  for (let day = 0; day < 7; day++) {
    const dayGames = dayMap.get(day) || [];
    const wins = dayGames.filter(g => g.result === 'win' || g.result === 'checkmate').length;
    const total = dayGames.length;

    results.push({
      dayOfWeek: day,
      gamesPlayed: total,
      winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
    });
  }

  return results;
}
