/**
 * Player Profile Generator
 *
 * Analyzes all games to build a comprehensive player profile with:
 * - Opening repertoire analysis
 * - Phase performance (opening/middlegame/endgame)
 * - Pattern-based weakness/strength detection
 * - Pre-computed summaries for instant chatbot responses
 */

import type { CompactGameSummaryT } from '../summaries/schemas';
import { getFamilyForEco } from '../data/ecoDatabase';
import type {
  PlayerProfileT,
  OpeningStatsT,
  PhaseStatsT,
  PlayerPatternT,
  TimeControlStatsT,
  ResultPatternsT,
} from './schema';

/**
 * Generate a complete player profile from game summaries
 */
export function generateProfile(
  userId: string,
  chesscomUsername: string | null,
  summaries: CompactGameSummaryT[]
): PlayerProfileT {
  if (summaries.length === 0) {
    return createEmptyProfile(userId, chesscomUsername);
  }

  // Sort games by date for trend analysis
  const sortedGames = [...summaries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Compute all stats
  const overall = computeOverallStats(sortedGames);
  const openings = computeOpeningStats(sortedGames, overall.winRate);
  const phases = computePhaseStats(sortedGames);
  const timeControls = computeTimeControlStats(sortedGames);
  const resultPatterns = computeResultPatterns(sortedGames);

  // Detect patterns (weaknesses and strengths)
  const patterns = detectPatterns(sortedGames, openings, phases, overall);
  const weaknesses = patterns.filter(p => p.type === 'weakness').sort((a, b) => b.severity - a.severity);
  const strengths = patterns.filter(p => p.type === 'strength').sort((a, b) => b.severity - a.severity);

  // Generate quick-access summaries
  const summariesObj = generateSummaries(weaknesses, strengths, sortedGames, overall);

  return {
    userId,
    chesscomUsername,
    generatedAt: new Date().toISOString(),
    gamesAnalyzed: summaries.length,
    dateRange: {
      oldest: sortedGames[0].date,
      newest: sortedGames[sortedGames.length - 1].date,
    },
    overall,
    openings,
    phases,
    timeControls,
    resultPatterns,
    weaknesses,
    strengths,
    summaries: summariesObj,
  };
}

/**
 * Create an empty profile for users with no games
 */
function createEmptyProfile(userId: string, chesscomUsername: string | null): PlayerProfileT {
  return {
    userId,
    chesscomUsername,
    generatedAt: new Date().toISOString(),
    gamesAnalyzed: 0,
    dateRange: null,
    overall: {
      winRate: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      avgAccuracy: null,
      ratingRange: null,
      currentRating: null,
      trend: 'stable',
    },
    openings: [],
    phases: [],
    timeControls: [],
    resultPatterns: {
      winPatterns: { byCheckmate: 0, byResignation: 0, byTimeout: 0, avgGameLength: 0 },
      lossPatterns: { byCheckmate: 0, byResignation: 0, byTimeout: 0, avgGameLength: 0, avgMoveOfDecisiveMistake: null },
    },
    weaknesses: [],
    strengths: [],
    summaries: {
      biggestWeakness: 'Not enough games analyzed yet',
      biggestStrength: 'Play more games to discover your strengths!',
      improvementPriority: 'Start playing games to get personalized advice',
      recentTrend: 'No trend data available yet',
    },
  };
}

/**
 * Compute overall performance stats
 */
function computeOverallStats(games: CompactGameSummaryT[]) {
  const wins = games.filter(g => g.result === 'win' || g.result === 'checkmate').length;
  const losses = games.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
  const draws = games.filter(g => g.result === 'draw' || g.result === 'stalemate').length;
  const total = wins + losses + draws;

  const winRate = total > 0 ? (wins / total) * 100 : 0;

  // Rating range
  const ratings = games.map(g => g.userRating).filter((r): r is number => r !== null);
  const ratingRange: [number, number] | null = ratings.length > 0
    ? [Math.min(...ratings), Math.max(...ratings)]
    : null;
  const currentRating = ratings.length > 0 ? ratings[ratings.length - 1] : null;

  // Trend: compare last 10 games to previous 10
  const trend = computeTrend(games);

  return {
    winRate: Math.round(winRate * 10) / 10,
    wins,
    losses,
    draws,
    avgAccuracy: null, // Would need analysis data
    ratingRange,
    currentRating,
    trend,
  };
}

/**
 * Compute rating/performance trend
 */
function computeTrend(games: CompactGameSummaryT[]): 'improving' | 'stable' | 'declining' {
  if (games.length < 10) return 'stable';

  const recentGames = games.slice(-10);
  const previousGames = games.slice(-20, -10);

  if (previousGames.length < 5) return 'stable';

  const recentWinRate = computeWinRate(recentGames);
  const previousWinRate = computeWinRate(previousGames);

  const diff = recentWinRate - previousWinRate;

  if (diff > 10) return 'improving';
  if (diff < -10) return 'declining';
  return 'stable';
}

function computeWinRate(games: CompactGameSummaryT[]): number {
  const wins = games.filter(g => g.result === 'win' || g.result === 'checkmate').length;
  const losses = games.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
  const total = wins + losses;
  return total > 0 ? (wins / total) * 100 : 50;
}

/**
 * Compute opening-specific stats with pattern detection
 */
function computeOpeningStats(games: CompactGameSummaryT[], overallWinRate: number): OpeningStatsT[] {
  // Group games by opening
  const openingMap = new Map<string, CompactGameSummaryT[]>();

  for (const game of games) {
    const openingName = game.opening?.name || 'Unknown';
    if (openingName === 'Unknown' || !openingName) continue;

    if (!openingMap.has(openingName)) {
      openingMap.set(openingName, []);
    }
    openingMap.get(openingName)!.push(game);
  }

  const stats: OpeningStatsT[] = [];

  for (const [name, openingGames] of Array.from(openingMap.entries())) {
    if (openingGames.length < 2) continue; // Need at least 2 games for meaningful stats

    const eco = openingGames[0].opening?.eco || null;
    const family = eco ? getFamilyForEco(eco) : null;

    const asWhite = openingGames.filter(g => g.userColor === 'white').length;
    const asBlack = openingGames.filter(g => g.userColor === 'black').length;

    const wins = openingGames.filter(g => g.result === 'win' || g.result === 'checkmate').length;
    const losses = openingGames.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
    const draws = openingGames.filter(g => g.result === 'draw' || g.result === 'stalemate').length;
    const total = wins + losses + draws;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    const avgMistakes = openingGames.reduce((sum, g) => sum + g.mistakes, 0) / openingGames.length;
    const avgBlunders = openingGames.reduce((sum, g) => sum + g.blunders, 0) / openingGames.length;

    // Early eval tracking
    const evalAt10 = computeAvgEvalAtMove(openingGames, 10);
    const evalAt20 = computeAvgEvalAtMove(openingGames, 20);

    // Find typical deviation from "book" (first mistake move)
    const deviationMoves = openingGames
      .map(g => findFirstMistakeMove(g))
      .filter((m): m is number => m !== null);
    const typicalDeviationMove = deviationMoves.length > 0
      ? Math.round(deviationMoves.reduce((a, b) => a + b, 0) / deviationMoves.length)
      : null;

    // Classify as weakness/strength
    const significantDiff = 15; // 15% difference from overall
    const isWeakness = winRate < overallWinRate - significantDiff && openingGames.length >= 3;
    const isStrength = winRate > overallWinRate + significantDiff && openingGames.length >= 3;
    const needsStudy = isWeakness && openingGames.length >= 5; // Plays it often but struggles

    // Select example games (best win, worst loss, most recent)
    const exampleGameIds = selectExampleGames(openingGames);

    stats.push({
      name,
      eco,
      family,
      gamesPlayed: openingGames.length,
      asWhite,
      asBlack,
      wins,
      losses,
      draws,
      winRate: Math.round(winRate * 10) / 10,
      avgAccuracy: null,
      avgMistakesPerGame: Math.round(avgMistakes * 10) / 10,
      avgBlundersPerGame: Math.round(avgBlunders * 10) / 10,
      avgEvalAtMove10: evalAt10,
      avgEvalAtMove20: evalAt20,
      typicalDeviationMove,
      isWeakness,
      isStrength,
      needsStudy,
      exampleGameIds,
    });
  }

  // Sort by games played (most frequent first)
  return stats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

function computeAvgEvalAtMove(games: CompactGameSummaryT[], moveNo: number): number | null {
  const evals: number[] = [];

  for (const game of games) {
    const pos = game.keyPositions.find(p => p.moveNo === moveNo || (p.moveNo >= moveNo - 1 && p.moveNo <= moveNo + 1));
    if (pos?.evalAfter !== null && pos?.evalAfter !== undefined) {
      // Normalize for user's color
      const normalizedEval = game.userColor === 'white' ? pos.evalAfter : -pos.evalAfter;
      evals.push(normalizedEval);
    }
  }

  if (evals.length === 0) return null;
  return Math.round((evals.reduce((a, b) => a + b, 0) / evals.length) * 100) / 100;
}

function findFirstMistakeMove(game: CompactGameSummaryT): number | null {
  const mistakePos = game.keyPositions.find(p =>
    p.tag.includes('mistake') || p.tag.includes('blunder') || p.tag.includes('inaccuracy')
  );
  return mistakePos?.moveNo || null;
}

function selectExampleGames(games: CompactGameSummaryT[]): string[] {
  const ids: string[] = [];

  // Most recent game
  const sorted = [...games].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (sorted[0]) ids.push(sorted[0].gameId);

  // A win (if any)
  const win = games.find(g => g.result === 'win' || g.result === 'checkmate');
  if (win && !ids.includes(win.gameId)) ids.push(win.gameId);

  // A loss with mistakes (instructive)
  const instructiveLoss = games.find(g =>
    (g.result === 'loss' || g.result === 'resign') && g.blunders > 0
  );
  if (instructiveLoss && !ids.includes(instructiveLoss.gameId)) ids.push(instructiveLoss.gameId);

  return ids.slice(0, 3);
}

/**
 * Compute phase-specific performance
 */
function computePhaseStats(games: CompactGameSummaryT[]): PhaseStatsT[] {
  const phases: Array<{
    phase: 'opening' | 'middlegame' | 'endgame';
    moveRange: [number, number];
  }> = [
    { phase: 'opening', moveRange: [1, 15] },
    { phase: 'middlegame', moveRange: [16, 35] },
    { phase: 'endgame', moveRange: [36, 200] },
  ];

  const stats = phases.map(({ phase, moveRange }) => {
    let totalEvalChange = 0;
    let totalMistakes = 0;
    let totalBlunders = 0;
    let gamesWithPhase = 0;

    for (const game of games) {
      const phasePositions = game.keyPositions.filter(
        p => p.moveNo >= moveRange[0] && p.moveNo <= moveRange[1]
      );

      if (phasePositions.length > 0) {
        gamesWithPhase++;

        // Calculate eval change in this phase
        for (const pos of phasePositions) {
          if (pos.evalBefore !== null && pos.evalAfter !== null) {
            const change = game.userColor === 'white'
              ? pos.evalAfter - pos.evalBefore
              : pos.evalBefore - pos.evalAfter;
            totalEvalChange += change;
          }

          if (pos.tag.includes('mistake')) totalMistakes++;
          if (pos.tag.includes('blunder')) totalBlunders++;
        }
      }
    }

    const avgEvalChange = gamesWithPhase > 0 ? totalEvalChange / gamesWithPhase : 0;
    const mistakeRate = gamesWithPhase > 0 ? totalMistakes / gamesWithPhase : 0;
    const blunderRate = gamesWithPhase > 0 ? totalBlunders / gamesWithPhase : 0;

    return {
      phase,
      moveRange,
      avgEvalChange: Math.round(avgEvalChange * 100) / 100,
      mistakeRate: Math.round(mistakeRate * 100) / 100,
      blunderRate: Math.round(blunderRate * 100) / 100,
      isWeakestPhase: false,
      isStrongestPhase: false,
      commonMistakeTypes: detectCommonMistakeTypes(games, moveRange),
    };
  });

  // Determine weakest and strongest phases based on mistake rate
  if (stats.length >= 2) {
    const sortedByMistakes = [...stats].sort((a, b) => b.mistakeRate - a.mistakeRate);
    const weakest = sortedByMistakes[0];
    const strongest = sortedByMistakes[sortedByMistakes.length - 1];

    // Only mark if there's a meaningful difference
    if (weakest.mistakeRate > strongest.mistakeRate + 0.3) {
      const weakestIndex = stats.findIndex(s => s.phase === weakest.phase);
      const strongestIndex = stats.findIndex(s => s.phase === strongest.phase);
      if (weakestIndex >= 0) stats[weakestIndex].isWeakestPhase = true;
      if (strongestIndex >= 0) stats[strongestIndex].isStrongestPhase = true;
    }
  }

  return stats;
}

function detectCommonMistakeTypes(games: CompactGameSummaryT[], moveRange: [number, number]): string[] {
  const types: string[] = [];

  // Check for tactical oversights (blunders)
  let blunderCount = 0;
  let mistakeCount = 0;

  for (const game of games) {
    const phasePositions = game.keyPositions.filter(
      p => p.moveNo >= moveRange[0] && p.moveNo <= moveRange[1]
    );
    blunderCount += phasePositions.filter(p => p.tag.includes('blunder')).length;
    mistakeCount += phasePositions.filter(p => p.tag.includes('mistake')).length;
  }

  if (blunderCount > games.length * 0.3) types.push('tactical oversights');
  if (mistakeCount > games.length * 0.5) types.push('positional errors');

  return types;
}

/**
 * Compute time control specific stats
 */
function computeTimeControlStats(games: CompactGameSummaryT[]): TimeControlStatsT[] {
  const tcMap = new Map<string, CompactGameSummaryT[]>();

  for (const game of games) {
    const tc = game.timeControl.type;
    if (!tcMap.has(tc)) tcMap.set(tc, []);
    tcMap.get(tc)!.push(game);
  }

  const stats: TimeControlStatsT[] = [];

  for (const [type, tcGames] of Array.from(tcMap.entries())) {
    const wins = tcGames.filter(g => g.result === 'win' || g.result === 'checkmate').length;
    const losses = tcGames.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout').length;
    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    const avgMistakes = tcGames.reduce((sum, g) => sum + g.mistakes, 0) / tcGames.length;

    // Time pressure analysis - count late blunders
    const blundersInTimeScramble = tcGames.reduce((sum, game) => {
      const lateBlunders = game.keyPositions.filter(
        p => p.moveNo >= 35 && p.tag.includes('blunder')
      ).length;
      return sum + lateBlunders;
    }, 0);

    stats.push({
      type: type as TimeControlStatsT['type'],
      gamesPlayed: tcGames.length,
      winRate: Math.round(winRate * 10) / 10,
      avgAccuracy: null,
      avgMistakesPerGame: Math.round(avgMistakes * 10) / 10,
      avgAccuracyLast2Min: null,
      blundersInTimeScramble,
    });
  }

  return stats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

/**
 * Compute result patterns
 */
function computeResultPatterns(games: CompactGameSummaryT[]): ResultPatternsT {
  const wins = games.filter(g => g.result === 'win' || g.result === 'checkmate');
  const losses = games.filter(g => g.result === 'loss' || g.result === 'resign' || g.result === 'timeout');

  // Win patterns
  const winByCheckmate = wins.filter(g => g.result === 'checkmate').length;
  const winByResignation = wins.filter(g => g.result === 'win').length; // opponent resigned
  const winByTimeout = 0; // Would need more detailed result data

  // Loss patterns
  const lossByCheckmate = losses.filter(g => g.result === 'checkmate').length;
  const lossByResignation = losses.filter(g => g.result === 'resign').length;
  const lossByTimeout = losses.filter(g => g.result === 'timeout').length;

  // Average game length
  const avgWinLength = wins.length > 0
    ? wins.reduce((sum, g) => sum + Math.max(...g.keyPositions.map(p => p.moveNo), 0), 0) / wins.length
    : 0;
  const avgLossLength = losses.length > 0
    ? losses.reduce((sum, g) => sum + Math.max(...g.keyPositions.map(p => p.moveNo), 0), 0) / losses.length
    : 0;

  // Average move of decisive mistake in losses
  const decisiveMistakeMoves = losses
    .map(g => g.keyPositions.find(p => p.tag.includes('blunder'))?.moveNo)
    .filter((m): m is number => m !== undefined);
  const avgMoveOfDecisiveMistake = decisiveMistakeMoves.length > 0
    ? Math.round(decisiveMistakeMoves.reduce((a, b) => a + b, 0) / decisiveMistakeMoves.length)
    : null;

  return {
    winPatterns: {
      byCheckmate: winByCheckmate,
      byResignation: winByResignation,
      byTimeout: winByTimeout,
      avgGameLength: Math.round(avgWinLength),
    },
    lossPatterns: {
      byCheckmate: lossByCheckmate,
      byResignation: lossByResignation,
      byTimeout: lossByTimeout,
      avgGameLength: Math.round(avgLossLength),
      avgMoveOfDecisiveMistake,
    },
  };
}

/**
 * Calculate confidence level based on sample size
 */
function getConfidence(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= 10) return 'high';
  if (sampleSize >= 5) return 'medium';
  return 'low';
}

/**
 * Adjust severity based on confidence - low confidence patterns get reduced severity
 */
function adjustSeverityForConfidence(baseSeverity: number, confidence: 'low' | 'medium' | 'high'): number {
  if (confidence === 'high') return baseSeverity;
  if (confidence === 'medium') return Math.max(1, baseSeverity - 2);
  return Math.max(1, baseSeverity - 4); // Low confidence = much lower severity
}

/**
 * Detect patterns (weaknesses and strengths) across all data
 */
function detectPatterns(
  games: CompactGameSummaryT[],
  openings: OpeningStatsT[],
  phases: PhaseStatsT[],
  overall: { winRate: number }
): PlayerPatternT[] {
  const patterns: PlayerPatternT[] = [];
  let patternId = 1;

  // 1. Opening weaknesses
  for (const opening of openings) {
    if (opening.isWeakness && opening.gamesPlayed >= 3) {
      const winDiff = Math.round(overall.winRate - opening.winRate);
      const confidence = getConfidence(opening.gamesPlayed);
      const baseSeverity = Math.min(10, Math.max(1, Math.round(winDiff / 5) + (opening.needsStudy ? 2 : 0)));
      const adjustedSeverity = adjustSeverityForConfidence(baseSeverity, confidence);

      // Add confidence context to description
      const confidenceNote = confidence === 'low'
        ? ' (small sample size - needs more games to confirm)'
        : confidence === 'medium'
        ? ' (moderate sample size)'
        : '';

      patterns.push({
        id: `opening-weakness-${patternId++}`,
        type: 'weakness',
        category: 'opening',
        title: opening.name,
        description: opening.typicalDeviationMove
          ? `Struggles after move ${opening.typicalDeviationMove}${confidenceNote}`
          : `Win rate ${winDiff}% below average${confidenceNote}`,
        severity: adjustedSeverity,
        frequency: `${opening.gamesPlayed} games`,
        stats: `${Math.round(opening.winRate)}% win rate vs ${Math.round(overall.winRate)}% overall`,
        sampleSize: opening.gamesPlayed,
        confidence,
        recommendation: confidence === 'low'
          ? `Play more ${opening.name} games to confirm this pattern, then study if it persists`
          : `Study ${opening.name} through move ${opening.typicalDeviationMove || 15}`,
        exampleGameIds: opening.exampleGameIds,
      });
    }

    if (opening.isStrength && opening.gamesPlayed >= 3) {
      const confidence = getConfidence(opening.gamesPlayed);
      const baseSeverity = Math.min(10, Math.round((opening.winRate - overall.winRate) / 5));
      const adjustedSeverity = adjustSeverityForConfidence(baseSeverity, confidence);

      patterns.push({
        id: `opening-strength-${patternId++}`,
        type: 'strength',
        category: 'opening',
        title: opening.name,
        description: `Strong performance with ${Math.round(opening.winRate)}% win rate`,
        severity: adjustedSeverity,
        frequency: `${opening.gamesPlayed} games`,
        stats: `${Math.round(opening.winRate)}% win rate vs ${Math.round(overall.winRate)}% overall`,
        sampleSize: opening.gamesPlayed,
        confidence,
        recommendation: `Continue playing ${opening.name} - it's one of your best openings`,
        exampleGameIds: opening.exampleGameIds,
      });
    }
  }

  // 2. Phase weaknesses
  if (phases.length === 3) {
    // Find weakest and strongest phases
    const sortedByMistakes = [...phases].sort((a, b) => b.mistakeRate - a.mistakeRate);
    const weakestPhase = sortedByMistakes[0];
    const strongestPhase = sortedByMistakes[sortedByMistakes.length - 1];

    if (weakestPhase.mistakeRate > strongestPhase.mistakeRate + 0.5) {
      const confidence = getConfidence(games.length);
      patterns.push({
        id: `phase-weakness-${patternId++}`,
        type: 'weakness',
        category: weakestPhase.phase as PlayerPatternT['category'],
        title: `${weakestPhase.phase.charAt(0).toUpperCase() + weakestPhase.phase.slice(1)} play`,
        description: `Higher mistake rate in ${weakestPhase.phase} (moves ${weakestPhase.moveRange[0]}-${weakestPhase.moveRange[1]})`,
        severity: adjustSeverityForConfidence(Math.min(10, Math.round(weakestPhase.mistakeRate * 3)), confidence),
        frequency: `${weakestPhase.mistakeRate.toFixed(1)} mistakes/game`,
        stats: `${weakestPhase.blunderRate.toFixed(1)} blunders/game in ${weakestPhase.phase}`,
        sampleSize: games.length,
        confidence,
        recommendation: weakestPhase.phase === 'endgame'
          ? 'Practice basic endgame positions (K+P vs K, rook endgames)'
          : weakestPhase.phase === 'opening'
          ? 'Study your main opening lines deeper'
          : 'Work on tactical vision and piece coordination',
        exampleGameIds: [],
      });
    }
  }

  // 3. Tactical weakness (high blunder rate overall)
  const totalBlunders = games.reduce((sum, g) => sum + g.blunders, 0);
  const avgBlundersPerGame = games.length > 0 ? totalBlunders / games.length : 0;

  if (avgBlundersPerGame > 1.5) {
    const confidence = getConfidence(games.length);
    patterns.push({
      id: `tactical-weakness-${patternId++}`,
      type: 'weakness',
      category: 'tactical',
      title: 'Tactical oversight pattern',
      description: 'Frequently missing tactical threats',
      severity: adjustSeverityForConfidence(Math.min(10, Math.round(avgBlundersPerGame * 2)), confidence),
      frequency: `${avgBlundersPerGame.toFixed(1)} blunders per game`,
      stats: `${totalBlunders} total blunders in ${games.length} games`,
      sampleSize: games.length,
      confidence,
      recommendation: 'Practice tactical puzzles daily (15-20 puzzles on Lichess or Chess.com)',
      exampleGameIds: games
        .filter(g => g.blunders >= 2)
        .slice(0, 3)
        .map(g => g.gameId),
    });
  }

  // 4. Time pressure weakness (blunders late in games)
  const lateBlunders = games.reduce((sum, game) => {
    return sum + game.keyPositions.filter(p => p.moveNo >= 35 && p.tag.includes('blunder')).length;
  }, 0);

  if (lateBlunders > games.length * 0.3) {
    const confidence = getConfidence(games.length);
    patterns.push({
      id: `time-weakness-${patternId++}`,
      type: 'weakness',
      category: 'time',
      title: 'Time pressure blunders',
      description: 'Making mistakes when time gets low',
      severity: adjustSeverityForConfidence(Math.min(10, Math.round((lateBlunders / games.length) * 5)), confidence),
      frequency: `${lateBlunders} late-game blunders`,
      stats: `${((lateBlunders / games.length) * 100).toFixed(0)}% of games have late blunders`,
      sampleSize: games.length,
      confidence,
      recommendation: 'Practice time management - aim to have 2+ minutes at move 30',
      exampleGameIds: [],
    });
  }

  return patterns;
}

/**
 * Generate quick-access summaries for common questions
 */
function generateSummaries(
  weaknesses: PlayerPatternT[],
  strengths: PlayerPatternT[],
  games: CompactGameSummaryT[],
  overall: { winRate: number; trend: 'improving' | 'stable' | 'declining' }
): PlayerProfileT['summaries'] {
  const biggestWeakness = weaknesses[0]
    ? `${weaknesses[0].title}: ${weaknesses[0].description} (${weaknesses[0].stats})`
    : 'No significant weaknesses detected - keep playing to gather more data!';

  const biggestStrength = strengths[0]
    ? `${strengths[0].title}: ${strengths[0].description}`
    : 'Play more games to discover your strengths!';

  const improvementPriority = weaknesses[0]
    ? weaknesses[0].recommendation
    : 'Continue playing and focus on avoiding blunders';

  let recentTrend = '';
  if (overall.trend === 'improving') {
    recentTrend = 'Your recent games show improvement - keep up the good work!';
  } else if (overall.trend === 'declining') {
    recentTrend = 'Your recent results have dipped - focus on fundamentals';
  } else {
    recentTrend = `Performance stable at ${Math.round(overall.winRate)}% win rate`;
  }

  return {
    biggestWeakness,
    biggestStrength,
    improvementPriority,
    recentTrend,
  };
}
