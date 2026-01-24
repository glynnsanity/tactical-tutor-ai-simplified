/**
 * Player Profile Schema
 *
 * Pre-computed analysis of a player's games for instant chatbot responses.
 * Generated during/after game ingestion, stored alongside summaries.
 */

import { z } from 'zod';

/**
 * Opening performance tracking
 */
export const OpeningStats = z.object({
  name: z.string(),
  eco: z.string().nullable(),
  family: z.string().nullable(),          // e.g., "sicilian", "french"

  // Game counts
  gamesPlayed: z.number(),
  asWhite: z.number(),
  asBlack: z.number(),

  // Results
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  winRate: z.number(),                     // 0-100

  // Quality metrics
  avgAccuracy: z.number().nullable(),      // If available
  avgMistakesPerGame: z.number(),
  avgBlundersPerGame: z.number(),

  // Pattern detection
  avgEvalAtMove10: z.number().nullable(),  // How are they doing early?
  avgEvalAtMove20: z.number().nullable(),  // How about mid-opening?
  typicalDeviationMove: z.number().nullable(), // Where do they leave "book"?

  // Classification
  isWeakness: z.boolean(),                 // Win rate significantly below overall
  isStrength: z.boolean(),                 // Win rate significantly above overall
  needsStudy: z.boolean(),                 // Plays it but struggles

  // Example games for this opening
  exampleGameIds: z.array(z.string()),     // 2-3 representative games
});

export type OpeningStatsT = z.infer<typeof OpeningStats>;

/**
 * Game phase performance
 */
export const PhaseStats = z.object({
  phase: z.enum(['opening', 'middlegame', 'endgame']),
  moveRange: z.tuple([z.number(), z.number()]), // e.g., [1, 15] for opening

  // Performance
  avgEvalChange: z.number(),               // How much eval changes in this phase
  mistakeRate: z.number(),                 // Mistakes per game in this phase
  blunderRate: z.number(),

  // Comparison to other phases
  isWeakestPhase: z.boolean(),
  isStrongestPhase: z.boolean(),

  // Specific patterns
  commonMistakeTypes: z.array(z.string()), // e.g., ["tactics", "time pressure"]
});

export type PhaseStatsT = z.infer<typeof PhaseStats>;

/**
 * Identified weakness or strength
 */
export const PlayerPattern = z.object({
  id: z.string(),                          // Unique identifier
  type: z.enum(['weakness', 'strength']),
  category: z.enum(['opening', 'tactical', 'positional', 'endgame', 'time', 'general']),

  // Human-readable
  title: z.string(),                       // "Evans Gambit"
  description: z.string(),                 // "Struggles after move 8-9"

  // Evidence
  severity: z.number().min(1).max(10),     // 1 = minor, 10 = critical
  frequency: z.string(),                   // "5 of 7 games"
  stats: z.string(),                       // "29% win rate vs 58% overall"
  sampleSize: z.number(),                  // Number of games this pattern is based on
  confidence: z.enum(['low', 'medium', 'high']), // Based on sample size

  // Actionable
  recommendation: z.string(),              // "Study Evans Gambit through move 12"

  // Examples
  exampleGameIds: z.array(z.string()),
  examplePositions: z.array(z.object({
    gameId: z.string(),
    fen: z.string(),
    moveNumber: z.number(),
    description: z.string(),
  })).optional(),
});

export type PlayerPatternT = z.infer<typeof PlayerPattern>;

/**
 * Time control performance
 */
export const TimeControlStats = z.object({
  type: z.enum(['bullet', 'blitz', 'rapid', 'classical', 'daily']),
  gamesPlayed: z.number(),
  winRate: z.number(),
  avgAccuracy: z.number().nullable(),
  avgMistakesPerGame: z.number(),

  // Time pressure analysis (for timed games)
  avgAccuracyLast2Min: z.number().nullable(),
  blundersInTimeScramble: z.number(),
});

export type TimeControlStatsT = z.infer<typeof TimeControlStats>;

/**
 * Result pattern analysis
 */
export const ResultPatterns = z.object({
  // How do wins happen?
  winPatterns: z.object({
    byCheckmate: z.number(),
    byResignation: z.number(),
    byTimeout: z.number(),
    avgGameLength: z.number(),
  }),

  // How do losses happen?
  lossPatterns: z.object({
    byCheckmate: z.number(),
    byResignation: z.number(),
    byTimeout: z.number(),
    avgGameLength: z.number(),
    avgMoveOfDecisiveMistake: z.number().nullable(),
  }),
});

export type ResultPatternsT = z.infer<typeof ResultPatterns>;

/**
 * Complete Player Profile
 */
export const PlayerProfile = z.object({
  // Metadata
  userId: z.string(),
  chesscomUsername: z.string().nullable(),
  generatedAt: z.string(),                 // ISO timestamp
  gamesAnalyzed: z.number(),
  dateRange: z.object({
    oldest: z.string(),
    newest: z.string(),
  }).nullable(),

  // Overall performance
  overall: z.object({
    winRate: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    avgAccuracy: z.number().nullable(),
    ratingRange: z.tuple([z.number(), z.number()]).nullable(),
    currentRating: z.number().nullable(),
    trend: z.enum(['improving', 'stable', 'declining']),
  }),

  // Detailed breakdowns
  openings: z.array(OpeningStats),
  phases: z.array(PhaseStats),
  timeControls: z.array(TimeControlStats),
  resultPatterns: ResultPatterns,

  // Pre-ranked insights (ready for chatbot)
  weaknesses: z.array(PlayerPattern),      // Sorted by severity
  strengths: z.array(PlayerPattern),

  // Quick-access summaries for common questions
  summaries: z.object({
    biggestWeakness: z.string(),           // One-liner for quick response
    biggestStrength: z.string(),
    improvementPriority: z.string(),       // What to work on first
    recentTrend: z.string(),               // "Improving in endgames lately"
  }),
});

export type PlayerProfileT = z.infer<typeof PlayerProfile>;
