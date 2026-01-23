import { type CompactGameSummaryT, KeyPosition } from '../summaries/schemas';
import type { z } from 'zod';

type KeyPositionT = z.infer<typeof KeyPosition>;
import { matchOpeningFromQuestion, type OpeningMatch } from './openingMatcher';
import { isEcoInFamily } from '../data/ecoDatabase';

// Question type classification
export type QuestionType =
  | { kind: 'opening'; opening: string; openingMatch: OpeningMatch }
  | { kind: 'blunders' }
  | { kind: 'time_control'; timeControl: 'bullet' | 'blitz' | 'rapid' | 'daily' }
  | { kind: 'result'; result: 'win' | 'loss' | 'draw' }
  | { kind: 'meta'; metaType: 'count' | 'overview' | 'openings' | 'stats' }
  | { kind: 'general' };

// Selected game with relevance info
export interface SelectedGame {
  gameId: string;
  opponent: string;
  date: string;
  result: 'win' | 'loss' | 'draw' | string;
  opening: { eco: string | null; name: string | null };
  userColor: 'white' | 'black';
  userRating: number | null;
  oppRating: number | null;
  timeControl: string;
  chesscomUrl: string | null;
  relevanceReason: string;
}

// Selected position to display
export interface SelectedPosition {
  fen: string;
  gameId: string;
  opponent: string;
  moveNumber: number;
  side: 'W' | 'B';
  movePlayed: string | null;
  bestMove: string | null;
  evalBefore: number;
  evalAfter: number;
  evalSwing: number;
  displayReason: string;
}

// Statistics summary
export interface Statistics {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  avgBlundersPerGame: number;
  relevantStat: string | null;
}

// Selection result - explicitly tracks whether matching games were found
export type SelectionResult =
  | { status: 'found'; games: SelectedGame[]; reason: string }
  | { status: 'no_matches'; requestedFilter: string; availableCount: number };

// Data availability info for transparency
export interface DataAvailability {
  hasMatchingGames: boolean;
  matchCount: number;
  totalGamesAnalyzed: number;
  requestedFilter: string | null;
  alternativeSuggestions: string[];
}

// Complete selected content for LLM
export interface SelectedContent {
  questionType: QuestionType;
  selectionResult: SelectionResult;
  games: SelectedGame[];
  positions: SelectedPosition[];
  statistics: Statistics;
  coachingContext: string;
  dataAvailability: DataAvailability;
}

/**
 * Main entry point: Select relevant content for the question
 */
export function selectContent(
  question: string,
  summaries: CompactGameSummaryT[],
  maxGames: number = 3,
  maxPositions: number = 2
): SelectedContent {
  const questionType = classifyQuestion(question);
  const selectionResult = selectGames(summaries, questionType, maxGames);

  // Extract games array from result (empty if no_matches)
  const games = selectionResult.status === 'found' ? selectionResult.games : [];
  const gameIds = games.map(g => g.gameId);

  // Only select positions if we have matching games
  const positions = games.length > 0
    ? selectPositionsFromSummaries(summaries, gameIds, questionType, maxPositions)
    : [];

  const statistics = computeStatistics(summaries, questionType);

  // Build data availability info
  const dataAvailability: DataAvailability = {
    hasMatchingGames: selectionResult.status === 'found' && games.length > 0,
    matchCount: games.length,
    totalGamesAnalyzed: summaries.length,
    requestedFilter: selectionResult.status === 'no_matches'
      ? selectionResult.requestedFilter
      : (selectionResult.status === 'found' ? selectionResult.reason : null),
    alternativeSuggestions: selectionResult.status === 'no_matches'
      ? generateAlternativeSuggestions(summaries, questionType)
      : [],
  };

  // Build context - will be different if no matches
  const coachingContext = selectionResult.status === 'found'
    ? buildCoachingContext(question, games, positions, statistics, questionType)
    : buildNoMatchContext(question, selectionResult, statistics, questionType, dataAvailability);

  return {
    questionType,
    selectionResult,
    games,
    positions,
    statistics,
    coachingContext,
    dataAvailability,
  };
}

/**
 * Build context string when no matching games were found
 */
function buildNoMatchContext(
  question: string,
  selectionResult: { status: 'no_matches'; requestedFilter: string; availableCount: number },
  statistics: Statistics,
  questionType: QuestionType,
  dataAvailability: DataAvailability
): string {
  const lines: string[] = [];

  lines.push(`PLAYER OVERVIEW:`);
  lines.push(`Total games analyzed: ${statistics.totalGames}`);
  lines.push(`Record: ${statistics.wins}W - ${statistics.losses}L - ${statistics.draws}D`);
  lines.push('');

  lines.push(`DATA AVAILABILITY:`);
  lines.push(`Requested: ${selectionResult.requestedFilter}`);
  lines.push(`Status: NO MATCHING GAMES FOUND`);
  lines.push(`Available games: ${selectionResult.availableCount}`);
  lines.push('');

  if (dataAvailability.alternativeSuggestions.length > 0) {
    lines.push(`WHAT THE USER DOES HAVE:`);
    for (const suggestion of dataAvailability.alternativeSuggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('');
  }

  lines.push(`QUESTION TYPE: ${questionType.kind}`);
  if (questionType.kind === 'opening') {
    lines.push(`Opening requested: ${questionType.opening}`);
  }

  return lines.join('\n');
}

/**
 * Detect if the question is a "meta" question asking about data/statistics
 * These questions want facts, not coaching advice
 */
function detectMetaQuestion(q: string): 'count' | 'overview' | 'openings' | 'stats' | null {
  // Count-type questions: "how many games", "total games", "number of games"
  if (
    (q.includes('how many') && (q.includes('game') || q.includes('match'))) ||
    (q.includes('total') && q.includes('game')) ||
    (q.includes('number of') && q.includes('game')) ||
    q.includes('do you have on me') ||
    q.includes('games do you have')
  ) {
    return 'count';
  }

  // Overview questions: "what data", "what do you know", "show me my data"
  if (
    (q.includes('what') && (q.includes('data') || q.includes('know about me'))) ||
    (q.includes('show') && q.includes('my') && (q.includes('data') || q.includes('history'))) ||
    q.includes('overview') ||
    q.includes('summary of my')
  ) {
    return 'overview';
  }

  // Opening-specific stats: "what openings do i play", "my favorite opening"
  if (
    (q.includes('what') && q.includes('opening') && (q.includes('play') || q.includes('use'))) ||
    (q.includes('my') && (q.includes('favorite') || q.includes('most played')) && q.includes('opening')) ||
    (q.includes('which') && q.includes('opening'))
  ) {
    return 'openings';
  }

  // General stats: "my stats", "my statistics", "win rate", "how am i doing"
  if (
    (q.includes('my') && (q.includes('stat') || q.includes('record'))) ||
    q.includes('win rate') ||
    q.includes('how am i doing') ||
    q.includes('my performance')
  ) {
    return 'stats';
  }

  return null;
}

/**
 * Classify the question type based on keywords
 * Uses fuzzy opening matching for accurate detection
 */
function classifyQuestion(question: string): QuestionType {
  const q = question.toLowerCase();

  // Check for META questions first (data-oriented questions that need facts, not coaching)
  // These should return statistics directly, not coaching advice
  const metaType = detectMetaQuestion(q);
  if (metaType) {
    return { kind: 'meta', metaType };
  }

  // Check for opening mentions using fuzzy matching
  const openingMatch = matchOpeningFromQuestion(question);
  if (openingMatch.matched && openingMatch.confidence > 0.6) {
    const openingName = openingMatch.opening?.name || openingMatch.family || 'unknown';
    return { kind: 'opening', opening: openingName.toLowerCase(), openingMatch };
  }

  // Check for blunder/mistake mentions
  if (q.includes('mistake') || q.includes('blunder') || q.includes('error') || q.includes('worst')) {
    return { kind: 'blunders' };
  }

  // Check for result mentions
  if (q.includes('win') || q.includes('won') || q.includes('victory')) {
    return { kind: 'result', result: 'win' };
  }
  if (q.includes('loss') || q.includes('lost') || q.includes('lose') || q.includes('losing')) {
    return { kind: 'result', result: 'loss' };
  }
  if (q.includes('draw')) {
    return { kind: 'result', result: 'draw' };
  }

  // Check for time control mentions
  if (q.includes('bullet')) {
    return { kind: 'time_control', timeControl: 'bullet' };
  }
  if (q.includes('blitz')) {
    return { kind: 'time_control', timeControl: 'blitz' };
  }
  if (q.includes('rapid')) {
    return { kind: 'time_control', timeControl: 'rapid' };
  }

  return { kind: 'general' };
}

/**
 * Add diversity to game selection by randomly sampling from top candidates
 * This prevents the same games from being shown repeatedly
 */
function selectWithDiversity(
  candidates: CompactGameSummaryT[],
  maxGames: number,
  questionType: QuestionType
): CompactGameSummaryT[] {
  if (candidates.length <= maxGames) {
    return candidates;
  }

  // For most question types, we want to sample from a larger pool
  // to provide variety in responses
  const poolSize = Math.min(candidates.length, maxGames * 3); // Top 3x candidates
  const pool = candidates.slice(0, poolSize);

  // Use weighted random selection favoring earlier (more relevant) items
  const selected: CompactGameSummaryT[] = [];
  const remaining = [...pool];

  while (selected.length < maxGames && remaining.length > 0) {
    // Weight selection toward beginning of array (more relevant games)
    // but with some randomness for diversity
    const weightedIndex = getWeightedRandomIndex(remaining.length);
    selected.push(remaining[weightedIndex]);
    remaining.splice(weightedIndex, 1);
  }

  return selected;
}

/**
 * Get a weighted random index favoring lower indices
 * Uses exponential decay so earlier items are more likely but not guaranteed
 */
function getWeightedRandomIndex(length: number): number {
  if (length <= 1) return 0;

  // Generate random number with exponential bias toward 0
  // This means index 0 is most likely, but others still have a chance
  const decay = 0.5; // Higher = more random, Lower = more deterministic
  const raw = Math.random();
  const weighted = Math.pow(raw, 1 / decay); // Bias toward 1
  const index = Math.floor((1 - weighted) * length);

  return Math.min(index, length - 1);
}

/**
 * Select relevant games based on question type
 * Returns explicit SelectionResult instead of silently falling back
 */
function selectGames(
  summaries: CompactGameSummaryT[],
  questionType: QuestionType,
  maxGames: number
): SelectionResult {
  let filtered: CompactGameSummaryT[] = [];
  let reason = '';
  let requestedFilter = '';

  switch (questionType.kind) {
    case 'opening': {
      const openingMatch = questionType.openingMatch;
      requestedFilter = `${questionType.opening} opening`;

      // Use ECO code matching if we have ECO codes from the match
      if (openingMatch.ecoCodes.length > 0 && openingMatch.family) {
        filtered = summaries.filter(g => {
          const gameEco = g.opening.eco?.toUpperCase() || '';

          // Check if game ECO is in the matched family
          if (gameEco && isEcoInFamily(gameEco, openingMatch.family!)) {
            return true;
          }

          // Also check name matching as fallback
          const name = g.opening.name?.toLowerCase() || '';
          return name.includes(questionType.opening) ||
                 (openingMatch.opening && name.includes(openingMatch.opening.name.toLowerCase()));
        });
      } else {
        // Fallback to simple name matching
        filtered = summaries.filter(g => {
          const name = g.opening.name?.toLowerCase() || '';
          const eco = g.opening.eco?.toLowerCase() || '';
          return name.includes(questionType.opening) || eco.includes(questionType.opening);
        });
      }
      reason = requestedFilter;
      break;
    }
    case 'blunders': {
      requestedFilter = 'games with mistakes';
      filtered = summaries
        .filter(g => (g.mistakes || 0) + (g.blunders || 0) > 0)
        .sort((a, b) => ((b.blunders || 0) + (b.mistakes || 0)) - ((a.blunders || 0) + (a.mistakes || 0)));
      reason = requestedFilter;
      break;
    }
    case 'result': {
      requestedFilter = `${questionType.result} games`;
      filtered = summaries.filter(g => g.result === questionType.result);
      reason = requestedFilter;
      break;
    }
    case 'time_control': {
      requestedFilter = `${questionType.timeControl} games`;
      filtered = summaries.filter(g => g.timeControl.type === questionType.timeControl);
      reason = requestedFilter;
      break;
    }
    case 'general':
    default: {
      // For general questions, prioritize games with interesting positions
      // This is the ONLY case where we use all games
      filtered = summaries
        .sort((a, b) => ((b.blunders || 0) + (b.mistakes || 0)) - ((a.blunders || 0) + (a.mistakes || 0)));
      reason = 'recent games with learning opportunities';
      requestedFilter = '';
      break;
    }
  }

  // NO SILENT FALLBACK - return explicit "no_matches" status
  // Only for non-general questions when filter returns nothing
  if (filtered.length === 0 && questionType.kind !== 'general') {
    return {
      status: 'no_matches',
      requestedFilter,
      availableCount: summaries.length,
    };
  }

  // Add diversity: randomly sample from top candidates instead of always picking the same ones
  // This prevents repetitive responses when asking similar questions
  const diverseSelection = selectWithDiversity(filtered, maxGames, questionType);

  // Convert to SelectedGame format
  const games = diverseSelection.map(g => ({
    gameId: g.gameId,
    opponent: g.opponent || 'Unknown',
    date: formatDate(g.date),
    result: g.result,
    opening: g.opening,
    userColor: g.userColor,
    userRating: g.userRating,
    oppRating: g.oppRating,
    timeControl: g.timeControl.type,
    chesscomUrl: g.chesscomUrl || null,
    relevanceReason: reason,
  }));

  return {
    status: 'found',
    games,
    reason,
  };
}

/**
 * Generate alternative suggestions based on what openings the user actually has
 */
function generateAlternativeSuggestions(
  summaries: CompactGameSummaryT[],
  questionType: QuestionType
): string[] {
  const suggestions: string[] = [];

  // Count games by opening
  const openingCounts = new Map<string, number>();
  for (const g of summaries) {
    const name = g.opening.name || g.opening.eco || 'Unknown';
    if (name !== 'Unknown') {
      openingCounts.set(name, (openingCounts.get(name) || 0) + 1);
    }
  }

  // Get top 5 openings user has played
  const topOpenings = [...openingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topOpenings.length > 0) {
    const openingList = topOpenings
      .map(([name, count]) => `${name} (${count})`)
      .join(', ');
    suggestions.push(`Your most played openings: ${openingList}`);
  }

  // Count by time control
  const tcCounts = new Map<string, number>();
  for (const g of summaries) {
    const tc = g.timeControl.type;
    tcCounts.set(tc, (tcCounts.get(tc) || 0) + 1);
  }

  const tcList = [...tcCounts.entries()]
    .filter(([_, count]) => count > 0)
    .map(([tc, count]) => `${tc} (${count})`)
    .join(', ');
  if (tcList) {
    suggestions.push(`Games by time control: ${tcList}`);
  }

  // Win/loss stats
  const wins = summaries.filter(g => g.result === 'win').length;
  const losses = summaries.filter(g => g.result === 'loss').length;
  if (wins > 0 || losses > 0) {
    suggestions.push(`I can analyze your ${wins} wins or ${losses} losses`);
  }

  return suggestions;
}

/**
 * Score a position for relevance
 */
function scorePosition(
  pos: KeyPositionT,
  questionType: QuestionType,
  gameResult: string
): number {
  let score = 0;

  // Eval swing is always important
  const evalBefore = pos.evalBefore ?? 0;
  const evalAfter = pos.evalAfter ?? 0;
  const swing = Math.abs(evalAfter - evalBefore);

  // Big swings are interesting (more than 1 pawn)
  if (swing > 1) {
    score += swing * 20;
  }

  // Tag-based relevance
  if (pos.tag.includes('blunder')) {
    score += 50;
  }
  if (pos.tag.includes('mistake')) {
    score += 30;
  }
  if (pos.tag.includes('missed_tactic')) {
    score += 40;
  }

  // Question-specific boosts
  if (questionType.kind === 'blunders') {
    if (pos.tag.includes('blunder')) score += 100;
    if (swing > 2) score += 50;
  }

  if (questionType.kind === 'opening' && pos.moveNo <= 15) {
    score += 30;
  }

  // Prefer positions from losses (more to learn)
  if (gameResult === 'loss') {
    score += 15;
  }

  return score;
}

/**
 * Select positions to display as boards
 */
function selectPositions(
  games: SelectedGame[],
  questionType: QuestionType,
  maxPositions: number
): SelectedPosition[] {
  // We need the full game data to get positions
  // This function receives already-selected games, so we need to work differently
  // Actually, we need access to the original summaries to get keyPositions
  // Let me refactor this...
  return [];
}

/**
 * Select positions from full game summaries
 */
export function selectPositionsFromSummaries(
  summaries: CompactGameSummaryT[],
  selectedGameIds: string[],
  questionType: QuestionType,
  maxPositions: number
): SelectedPosition[] {
  const selectedGames = summaries.filter(g => selectedGameIds.includes(g.gameId));

  // Collect all positions with their scores
  const scoredPositions: Array<{
    pos: KeyPositionT;
    game: CompactGameSummaryT;
    score: number;
  }> = [];

  for (const game of selectedGames) {
    for (const pos of game.keyPositions) {
      const score = scorePosition(pos, questionType, game.result);
      if (score > 0) {
        scoredPositions.push({ pos, game, score });
      }
    }
  }

  // Sort by score and take top N
  scoredPositions.sort((a, b) => b.score - a.score);

  return scoredPositions.slice(0, maxPositions).map(({ pos, game }) => {
    const evalBefore = pos.evalBefore ?? 0;
    const evalAfter = pos.evalAfter ?? 0;
    const swing = evalAfter - evalBefore;

    let displayReason = '';
    if (Math.abs(swing) > 2) {
      displayReason = `${swing < 0 ? 'Lost' : 'Gained'} ${Math.abs(swing).toFixed(1)} pawns`;
    } else if (pos.tag.includes('blunder')) {
      displayReason = 'Blunder';
    } else if (pos.tag.includes('mistake')) {
      displayReason = 'Mistake';
    } else if (pos.tag.includes('missed_tactic')) {
      displayReason = 'Missed tactic';
    } else {
      displayReason = 'Key position';
    }

    return {
      fen: pos.fen,
      gameId: game.gameId,
      opponent: game.opponent || 'Unknown',
      moveNumber: pos.moveNo,
      side: pos.side,
      movePlayed: pos.move || null,
      bestMove: pos.bestMove || null,
      evalBefore,
      evalAfter,
      evalSwing: swing,
      displayReason,
    };
  });
}

/**
 * Compute relevant statistics
 */
function computeStatistics(
  summaries: CompactGameSummaryT[],
  questionType: QuestionType
): Statistics {
  const totalGames = summaries.length;
  const wins = summaries.filter(g => g.result === 'win').length;
  const losses = summaries.filter(g => g.result === 'loss').length;
  const draws = summaries.filter(g => g.result === 'draw').length;

  const totalBlunders = summaries.reduce((sum, g) => sum + (g.blunders || 0), 0);
  const avgBlundersPerGame = totalGames > 0 ? totalBlunders / totalGames : 0;

  let relevantStat: string | null = null;

  switch (questionType.kind) {
    case 'opening': {
      const openingMatch = questionType.openingMatch;

      // Use ECO matching if available
      const openingGames = summaries.filter(g => {
        if (openingMatch.family && g.opening.eco) {
          if (isEcoInFamily(g.opening.eco, openingMatch.family)) {
            return true;
          }
        }
        // Fallback to name matching
        return g.opening.name?.toLowerCase().includes(questionType.opening);
      });

      const openingWins = openingGames.filter(g => g.result === 'win').length;
      if (openingGames.length > 0) {
        const winRate = ((openingWins / openingGames.length) * 100).toFixed(0);
        const openingName = openingMatch.opening?.name || questionType.opening;
        relevantStat = `${winRate}% win rate in ${openingGames.length} ${openingName} games`;
      }
      break;
    }
    case 'time_control': {
      const tcGames = summaries.filter(g => g.timeControl.type === questionType.timeControl);
      const tcWins = tcGames.filter(g => g.result === 'win').length;
      if (tcGames.length > 0) {
        const winRate = ((tcWins / tcGames.length) * 100).toFixed(0);
        relevantStat = `${winRate}% win rate in ${tcGames.length} ${questionType.timeControl} games`;
      }
      break;
    }
    case 'blunders': {
      relevantStat = `Average ${avgBlundersPerGame.toFixed(1)} blunders per game`;
      break;
    }
  }

  return {
    totalGames,
    wins,
    losses,
    draws,
    avgBlundersPerGame,
    relevantStat,
  };
}

/**
 * Build the coaching context string for the LLM prompt
 */
function buildCoachingContext(
  question: string,
  games: SelectedGame[],
  positions: SelectedPosition[],
  statistics: Statistics,
  questionType: QuestionType
): string {
  const lines: string[] = [];

  // Overall stats
  lines.push(`PLAYER OVERVIEW:`);
  lines.push(`Total games analyzed: ${statistics.totalGames}`);
  lines.push(`Record: ${statistics.wins}W - ${statistics.losses}L - ${statistics.draws}D`);
  if (statistics.relevantStat) {
    lines.push(`Relevant: ${statistics.relevantStat}`);
  }
  lines.push('');

  // Selected games
  if (games.length > 0) {
    lines.push(`SELECTED GAMES (${games[0].relevanceReason}):`);
    for (const game of games) {
      const resultEmoji = game.result === 'win' ? '✓' : game.result === 'loss' ? '✗' : '=';
      lines.push(`${resultEmoji} vs ${game.opponent} (${game.date})`);
      lines.push(`  Opening: ${game.opening.name || game.opening.eco || 'Unknown'}`);
      lines.push(`  Result: ${game.result} as ${game.userColor}`);
      if (game.chesscomUrl) {
        lines.push(`  Link: ${game.chesscomUrl}`);
      }
    }
    lines.push('');
  }

  // Selected positions (what will be shown as boards)
  if (positions.length > 0) {
    lines.push(`KEY POSITIONS TO DISCUSS (these will be shown as chess boards):`);
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      lines.push(`Position ${i + 1}: Move ${pos.moveNumber} vs ${pos.opponent}`);
      lines.push(`  Why: ${pos.displayReason}`);
      if (pos.movePlayed) {
        lines.push(`  Played: ${pos.movePlayed}${pos.bestMove ? `, Better: ${pos.bestMove}` : ''}`);
      }
      lines.push(`  Eval: ${pos.evalBefore.toFixed(1)} → ${pos.evalAfter.toFixed(1)} (${pos.evalSwing > 0 ? '+' : ''}${pos.evalSwing.toFixed(1)})`);
    }
    lines.push('');
  }

  // Question type context
  lines.push(`QUESTION TYPE: ${questionType.kind}`);
  if (questionType.kind === 'opening') {
    lines.push(`Opening focus: ${questionType.opening}`);
  }

  return lines.join('\n');
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Meta response data - factual statistics for meta questions
 */
export interface MetaResponseData {
  type: 'count' | 'overview' | 'openings' | 'stats';
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  dateRange: { oldest: string; newest: string } | null;
  topOpenings: Array<{ name: string; count: number; winRate: number }>;
  timeControlBreakdown: Array<{ type: string; count: number; winRate: number }>;
  avgBlundersPerGame: number;
  avgMistakesPerGame: number;
  ratingRange: { lowest: number; highest: number } | null;
}

/**
 * Compute detailed statistics for meta questions
 * Returns factual data to be presented directly (no LLM needed)
 */
export function computeMetaResponse(
  summaries: CompactGameSummaryT[],
  metaType: 'count' | 'overview' | 'openings' | 'stats'
): MetaResponseData {
  const totalGames = summaries.length;
  const wins = summaries.filter(g => g.result === 'win').length;
  const losses = summaries.filter(g => g.result === 'loss').length;
  const draws = summaries.filter(g => g.result === 'draw').length;
  const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

  // Date range
  let dateRange: { oldest: string; newest: string } | null = null;
  if (summaries.length > 0) {
    const dates = summaries.map(g => new Date(g.date).getTime()).filter(d => !isNaN(d));
    if (dates.length > 0) {
      const oldest = new Date(Math.min(...dates));
      const newest = new Date(Math.max(...dates));
      dateRange = {
        oldest: oldest.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        newest: newest.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    }
  }

  // Top openings
  const openingStats = new Map<string, { count: number; wins: number }>();
  for (const g of summaries) {
    const name = g.opening.name || g.opening.eco || 'Unknown';
    const stats = openingStats.get(name) || { count: 0, wins: 0 };
    stats.count++;
    if (g.result === 'win') stats.wins++;
    openingStats.set(name, stats);
  }

  const topOpenings = [...openingStats.entries()]
    .filter(([name, _]) => name !== 'Unknown')
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0,
    }));

  // Time control breakdown
  const tcStats = new Map<string, { count: number; wins: number }>();
  for (const g of summaries) {
    const tc = g.timeControl.type;
    const stats = tcStats.get(tc) || { count: 0, wins: 0 };
    stats.count++;
    if (g.result === 'win') stats.wins++;
    tcStats.set(tc, stats);
  }

  const timeControlBreakdown = [...tcStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([type, stats]) => ({
      type,
      count: stats.count,
      winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0,
    }));

  // Blunders and mistakes
  const totalBlunders = summaries.reduce((sum, g) => sum + (g.blunders || 0), 0);
  const totalMistakes = summaries.reduce((sum, g) => sum + (g.mistakes || 0), 0);
  const avgBlundersPerGame = totalGames > 0 ? totalBlunders / totalGames : 0;
  const avgMistakesPerGame = totalGames > 0 ? totalMistakes / totalGames : 0;

  // Rating range
  let ratingRange: { lowest: number; highest: number } | null = null;
  const ratings = summaries.map(g => g.userRating).filter((r): r is number => r !== null && r !== undefined);
  if (ratings.length > 0) {
    ratingRange = {
      lowest: Math.min(...ratings),
      highest: Math.max(...ratings),
    };
  }

  return {
    type: metaType,
    totalGames,
    wins,
    losses,
    draws,
    winRate,
    dateRange,
    topOpenings,
    timeControlBreakdown,
    avgBlundersPerGame,
    avgMistakesPerGame,
    ratingRange,
  };
}

/**
 * Format meta response data into human-readable text
 */
export function formatMetaResponse(data: MetaResponseData): string {
  const lines: string[] = [];

  switch (data.type) {
    case 'count':
      lines.push(`I have **${data.totalGames} games** from your Chess.com history.`);
      if (data.dateRange) {
        lines.push(`These games span from ${data.dateRange.oldest} to ${data.dateRange.newest}.`);
      }
      lines.push(`\n**Record:** ${data.wins} wins, ${data.losses} losses, ${data.draws} draws (${data.winRate.toFixed(0)}% win rate)`);
      break;

    case 'overview':
      lines.push(`## Your Chess Data Overview\n`);
      lines.push(`**Total Games:** ${data.totalGames}`);
      if (data.dateRange) {
        lines.push(`**Date Range:** ${data.dateRange.oldest} – ${data.dateRange.newest}`);
      }
      lines.push(`**Record:** ${data.wins}W - ${data.losses}L - ${data.draws}D (${data.winRate.toFixed(0)}% win rate)`);
      if (data.ratingRange) {
        lines.push(`**Rating Range:** ${data.ratingRange.lowest} – ${data.ratingRange.highest}`);
      }
      lines.push(`\n**Time Controls:**`);
      for (const tc of data.timeControlBreakdown) {
        lines.push(`- ${tc.type}: ${tc.count} games (${tc.winRate.toFixed(0)}% win rate)`);
      }
      lines.push(`\n**Top Openings:**`);
      for (const op of data.topOpenings.slice(0, 3)) {
        lines.push(`- ${op.name}: ${op.count} games (${op.winRate.toFixed(0)}% win rate)`);
      }
      break;

    case 'openings':
      lines.push(`## Your Most Played Openings\n`);
      if (data.topOpenings.length === 0) {
        lines.push(`I don't have opening data for your games yet.`);
      } else {
        for (let i = 0; i < data.topOpenings.length; i++) {
          const op = data.topOpenings[i];
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          lines.push(`${medal} **${op.name}**: ${op.count} games (${op.winRate.toFixed(0)}% win rate)`);
        }
      }
      lines.push(`\n*Based on ${data.totalGames} analyzed games.*`);
      break;

    case 'stats':
      lines.push(`## Your Performance Stats\n`);
      lines.push(`**Overall Record:** ${data.wins}W - ${data.losses}L - ${data.draws}D`);
      lines.push(`**Win Rate:** ${data.winRate.toFixed(1)}%`);
      if (data.ratingRange) {
        lines.push(`**Rating Range:** ${data.ratingRange.lowest} – ${data.ratingRange.highest}`);
      }
      lines.push(`\n**Accuracy:**`);
      lines.push(`- Average blunders per game: ${data.avgBlundersPerGame.toFixed(1)}`);
      lines.push(`- Average mistakes per game: ${data.avgMistakesPerGame.toFixed(1)}`);
      lines.push(`\n**By Time Control:**`);
      for (const tc of data.timeControlBreakdown) {
        lines.push(`- ${tc.type}: ${tc.winRate.toFixed(0)}% win rate (${tc.count} games)`);
      }
      break;
  }

  return lines.join('\n');
}
