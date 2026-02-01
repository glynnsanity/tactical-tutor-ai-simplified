/**
 * Interactive Analysis System
 *
 * Handles complex queries that require significant computation.
 * Provides scope estimation, user choice of depth, and progress feedback.
 */

import type { CompactGameSummaryT } from '../summaries/schemas';
import type { HistoricalStatsT } from '../profile/historicalStats';

/**
 * Analysis depth options
 */
export type AnalysisDepth = 'quick' | 'standard' | 'deep';

/**
 * Scope estimate for a query
 */
export interface ScopeEstimate {
  matchingGames: number;
  totalGames: number;
  requiresAnalysis: boolean;
  estimatedTime: {
    quick: string;      // e.g., "30 seconds"
    standard: string;   // e.g., "2 minutes"
    deep: string;       // e.g., "5 minutes"
  };
  recommendation: AnalysisDepth;
  reason: string;
}

/**
 * Analysis request from user after seeing scope
 */
export interface AnalysisRequest {
  questionType: string;
  filter: {
    opening?: string;
    timeControl?: string;
    dateRange?: { start: string; end: string };
    result?: 'win' | 'loss' | 'draw';
  };
  depth: AnalysisDepth;
}

/**
 * Progress update during analysis
 */
export interface AnalysisProgress {
  phase: 'filtering' | 'analyzing' | 'aggregating' | 'complete';
  current: number;
  total: number;
  message: string;
}

/**
 * Thresholds for when to prompt user for depth choice
 */
const ANALYSIS_THRESHOLDS = {
  // Below this, just do it without asking
  AUTO_ANALYZE: 20,
  // Above this, require user confirmation
  REQUIRE_CONFIRMATION: 100,
  // Maximum games for deep analysis
  MAX_DEEP_ANALYSIS: 500,
};

/**
 * Estimate analysis scope for a query
 */
export function estimateScope(
  games: CompactGameSummaryT[],
  filter: AnalysisRequest['filter']
): ScopeEstimate {
  // Count matching games
  const matchingGames = filterGames(games, filter);
  const count = matchingGames.length;

  // Determine if analysis is needed
  const requiresAnalysis = count > ANALYSIS_THRESHOLDS.AUTO_ANALYZE;

  // Estimate times based on game count
  const estimatedTime = {
    quick: estimateTime(Math.min(15, count)),
    standard: estimateTime(count),
    deep: estimateTime(count, true),
  };

  // Recommend a depth
  let recommendation: AnalysisDepth = 'standard';
  let reason = '';

  if (count <= ANALYSIS_THRESHOLDS.AUTO_ANALYZE) {
    recommendation = 'standard';
    reason = 'Small sample - full analysis is quick';
  } else if (count <= ANALYSIS_THRESHOLDS.REQUIRE_CONFIRMATION) {
    recommendation = 'standard';
    reason = 'Moderate sample - standard analysis recommended';
  } else {
    recommendation = 'quick';
    reason = 'Large dataset - quick analysis for faster results';
  }

  return {
    matchingGames: count,
    totalGames: games.length,
    requiresAnalysis,
    estimatedTime,
    recommendation,
    reason,
  };
}

/**
 * Filter games based on criteria
 */
export function filterGames(
  games: CompactGameSummaryT[],
  filter: AnalysisRequest['filter']
): CompactGameSummaryT[] {
  return games.filter(game => {
    // Opening filter
    if (filter.opening) {
      const gameName = game.opening?.name?.toLowerCase() || '';
      const gameEco = game.opening?.eco?.toLowerCase() || '';
      const filterOpening = filter.opening.toLowerCase();

      if (!gameName.includes(filterOpening) && !gameEco.includes(filterOpening)) {
        return false;
      }
    }

    // Time control filter
    if (filter.timeControl && game.timeControl.type !== filter.timeControl) {
      return false;
    }

    // Date range filter
    if (filter.dateRange) {
      const gameDate = new Date(game.date).getTime();
      const startDate = new Date(filter.dateRange.start).getTime();
      const endDate = new Date(filter.dateRange.end).getTime();

      if (gameDate < startDate || gameDate > endDate) {
        return false;
      }
    }

    // Result filter
    if (filter.result) {
      const isWin = game.result === 'win' || game.result === 'checkmate';
      const isLoss = game.result === 'loss' || game.result === 'resign' || game.result === 'timeout';
      const isDraw = game.result === 'draw' || game.result === 'stalemate';

      if (filter.result === 'win' && !isWin) return false;
      if (filter.result === 'loss' && !isLoss) return false;
      if (filter.result === 'draw' && !isDraw) return false;
    }

    return true;
  });
}

/**
 * Estimate time for analysis
 */
function estimateTime(gameCount: number, isDeep = false): string {
  // Base time per game (in seconds)
  const baseTimePerGame = isDeep ? 0.5 : 0.1;
  const overhead = 2; // Fixed overhead

  const totalSeconds = Math.ceil(gameCount * baseTimePerGame + overhead);

  if (totalSeconds < 60) {
    return `${totalSeconds} seconds`;
  } else {
    const minutes = Math.ceil(totalSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}

/**
 * Format scope estimate for user display
 */
export function formatScopePrompt(scope: ScopeEstimate, queryDescription: string): string {
  if (!scope.requiresAnalysis) {
    return ''; // No prompt needed, just do it
  }

  const lines: string[] = [];

  lines.push(`I found **${scope.matchingGames} games** matching your request.`);
  lines.push('');
  lines.push('How deep should I analyze?');
  lines.push('');
  lines.push(`⚡ **Quick** (${scope.estimatedTime.quick}): Sample ~15 games, estimate patterns`);
  lines.push(`📊 **Standard** (${scope.estimatedTime.standard}): All ${scope.matchingGames} games, full stats`);
  lines.push(`🔬 **Deep** (${scope.estimatedTime.deep}): Position-by-position analysis`);
  lines.push('');
  lines.push(`*Recommended: **${scope.recommendation.charAt(0).toUpperCase() + scope.recommendation.slice(1)}** - ${scope.reason}*`);

  return lines.join('\n');
}

/**
 * Perform analysis at the specified depth
 */
export async function performAnalysis(
  games: CompactGameSummaryT[],
  filter: AnalysisRequest['filter'],
  depth: AnalysisDepth,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<AnalysisResult> {
  const filteredGames = filterGames(games, filter);

  // Report initial progress
  onProgress?.({
    phase: 'filtering',
    current: 0,
    total: filteredGames.length,
    message: `Found ${filteredGames.length} matching games...`,
  });

  let gamesToAnalyze: CompactGameSummaryT[];

  switch (depth) {
    case 'quick':
      // Sample up to 15 games, weighted toward recent
      gamesToAnalyze = sampleGames(filteredGames, 15);
      break;
    case 'standard':
      gamesToAnalyze = filteredGames;
      break;
    case 'deep':
      gamesToAnalyze = filteredGames.slice(0, ANALYSIS_THRESHOLDS.MAX_DEEP_ANALYSIS);
      break;
  }

  // Analyze games
  const results = await analyzeGames(gamesToAnalyze, depth, onProgress);

  // Report completion
  onProgress?.({
    phase: 'complete',
    current: gamesToAnalyze.length,
    total: gamesToAnalyze.length,
    message: 'Analysis complete!',
  });

  return {
    depth,
    gamesAnalyzed: gamesToAnalyze.length,
    totalMatching: filteredGames.length,
    isSampled: depth === 'quick' && filteredGames.length > 15,
    ...results,
  };
}

/**
 * Sample games with recency bias
 */
function sampleGames(games: CompactGameSummaryT[], count: number): CompactGameSummaryT[] {
  if (games.length <= count) return games;

  // Sort by date (newest first)
  const sorted = [...games].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Take half from most recent, half random from rest
  const recentCount = Math.ceil(count / 2);
  const randomCount = count - recentCount;

  const recent = sorted.slice(0, recentCount);
  const rest = sorted.slice(recentCount);

  // Random sample from rest
  const randomSample: CompactGameSummaryT[] = [];
  const restCopy = [...rest];
  for (let i = 0; i < randomCount && restCopy.length > 0; i++) {
    const idx = Math.floor(Math.random() * restCopy.length);
    randomSample.push(restCopy.splice(idx, 1)[0]);
  }

  return [...recent, ...randomSample];
}

/**
 * Analysis result
 */
export interface AnalysisResult {
  depth: AnalysisDepth;
  gamesAnalyzed: number;
  totalMatching: number;
  isSampled: boolean;

  // Stats
  winRate: number;
  wins: number;
  losses: number;
  draws: number;

  // Patterns found
  patterns: Array<{
    type: 'strength' | 'weakness' | 'observation';
    description: string;
    evidence: string;
  }>;

  // Key positions (for deep analysis)
  keyPositions?: Array<{
    gameId: string;
    moveNumber: number;
    fen: string;
    description: string;
  }>;
}

/**
 * Analyze games at specified depth
 */
async function analyzeGames(
  games: CompactGameSummaryT[],
  depth: AnalysisDepth,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<Omit<AnalysisResult, 'depth' | 'gamesAnalyzed' | 'totalMatching' | 'isSampled'>> {
  const wins = games.filter(g => g.result === 'win' || g.result === 'checkmate').length;
  const losses = games.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
  const draws = games.filter(g => g.result === 'draw' || g.result === 'stalemate').length;
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;

  const patterns: AnalysisResult['patterns'] = [];

  // Analyze patterns
  onProgress?.({
    phase: 'analyzing',
    current: 0,
    total: games.length,
    message: 'Analyzing patterns...',
  });

  // Win rate pattern
  if (winRate > 60) {
    patterns.push({
      type: 'strength',
      description: `Strong performance with ${winRate}% win rate`,
      evidence: `${wins} wins in ${total} games`,
    });
  } else if (winRate < 40 && total >= 5) {
    patterns.push({
      type: 'weakness',
      description: `Below average performance at ${winRate}% win rate`,
      evidence: `${losses} losses in ${total} games`,
    });
  }

  // Blunder pattern
  const avgBlunders = games.reduce((sum, g) => sum + g.blunders, 0) / games.length;
  if (avgBlunders > 1.5) {
    patterns.push({
      type: 'weakness',
      description: 'High blunder rate',
      evidence: `${avgBlunders.toFixed(1)} blunders per game on average`,
    });
  }

  // Deep analysis: collect key positions
  let keyPositions: AnalysisResult['keyPositions'];
  if (depth === 'deep') {
    keyPositions = [];

    for (let i = 0; i < games.length; i++) {
      const game = games[i];

      onProgress?.({
        phase: 'analyzing',
        current: i + 1,
        total: games.length,
        message: `Analyzing game ${i + 1}/${games.length}...`,
      });

      // Find critical positions
      for (const pos of game.keyPositions) {
        const swing = Math.abs((pos.evalAfter ?? 0) - (pos.evalBefore ?? 0));
        if (swing > 2 || pos.tag.includes('blunder')) {
          keyPositions.push({
            gameId: game.gameId,
            moveNumber: pos.moveNo,
            fen: pos.fen,
            description: pos.tag.includes('blunder')
              ? `Blunder on move ${pos.moveNo}`
              : `Critical position (${swing.toFixed(1)} pawn swing)`,
          });
        }
      }

      // Limit key positions
      if (keyPositions.length >= 10) break;
    }
  }

  // Aggregate results
  onProgress?.({
    phase: 'aggregating',
    current: games.length,
    total: games.length,
    message: 'Compiling results...',
  });

  return {
    winRate,
    wins,
    losses,
    draws,
    patterns,
    keyPositions,
  };
}

/**
 * Format analysis result for display
 */
export function formatAnalysisResult(result: AnalysisResult, queryDescription: string): string {
  const lines: string[] = [];

  lines.push(`## Analysis Results\n`);

  // Sample note
  if (result.isSampled) {
    lines.push(`*Based on ${result.gamesAnalyzed} sampled games out of ${result.totalMatching} total*\n`);
  } else {
    lines.push(`*Analyzed ${result.gamesAnalyzed} games*\n`);
  }

  // Stats
  lines.push(`**Record:** ${result.wins}W - ${result.losses}L - ${result.draws}D`);
  lines.push(`**Win Rate:** ${result.winRate}%`);

  // Patterns
  if (result.patterns.length > 0) {
    lines.push(`\n**Findings:**`);
    for (const pattern of result.patterns) {
      const icon = pattern.type === 'strength' ? '✓' : pattern.type === 'weakness' ? '⚠️' : '•';
      lines.push(`${icon} ${pattern.description}`);
      lines.push(`  *${pattern.evidence}*`);
    }
  }

  // Key positions (deep analysis)
  if (result.keyPositions && result.keyPositions.length > 0) {
    lines.push(`\n**Key Positions to Review:**`);
    for (const pos of result.keyPositions.slice(0, 5)) {
      lines.push(`- Move ${pos.moveNumber}: ${pos.description}`);
    }
  }

  return lines.join('\n');
}
