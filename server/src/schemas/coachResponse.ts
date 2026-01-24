/**
 * Structured Coach Response Schema
 * Used for two-pass LLM approach to ensure grounded responses
 */

import { z } from 'zod';

/**
 * Reference to a specific game from context
 */
export const GameReference = z.object({
  gameId: z.string().describe('The game ID from context'),
  opponent: z.string().describe('Opponent name exactly as shown in context'),
  date: z.string().describe('Game date from context'),
  verifiedInContext: z.boolean().describe('True only if this game appears in SELECTED GAMES'),
});

export type GameReferenceT = z.infer<typeof GameReference>;

/**
 * Reference to a specific position from context
 */
export const PositionReference = z.object({
  moveNumber: z.number().describe('Move number from KEY POSITIONS'),
  description: z.string().describe('Brief description of the position'),
  evaluationChange: z.string().optional().describe('Eval change if mentioned in context'),
});

export type PositionReferenceT = z.infer<typeof PositionReference>;

/**
 * Grounding verification section
 * Forces the LLM to explicitly verify claims against context
 */
export const GroundingSection = z.object({
  questionUnderstood: z.string()
    .max(100)
    .describe('Brief restatement of what the user is asking'),

  dataAvailable: z.boolean()
    .describe('True if context contains relevant data to answer'),

  gamesReferenced: z.array(GameReference)
    .max(3)
    .describe('Games from context that will be mentioned'),

  positionsReferenced: z.array(PositionReference)
    .max(2)
    .describe('Positions from context that will be discussed'),
});

export type GroundingSectionT = z.infer<typeof GroundingSection>;

/**
 * The actual coaching advice
 */
export const AdviceSection = z.object({
  mainPoint: z.string()
    .max(200)
    .describe('One sentence main advice point'),

  explanation: z.string()
    .max(400)
    .describe('2-3 sentences explaining why this advice is relevant'),

  actionItem: z.string()
    .max(150)
    .optional()
    .describe('One specific thing to practice or focus on'),
});

export type AdviceSectionT = z.infer<typeof AdviceSection>;

/**
 * Metadata about response confidence
 */
export const MetaSection = z.object({
  confidenceLevel: z.enum(['high', 'medium', 'low'])
    .describe('How confident based on available data'),

  dataLimitations: z.string()
    .max(100)
    .optional()
    .describe('Any caveats about limited data'),
});

export type MetaSectionT = z.infer<typeof MetaSection>;

/**
 * Complete structured coach response
 */
export const StructuredCoachResponse = z.object({
  grounding: GroundingSection,
  advice: AdviceSection,
  meta: MetaSection,
});

export type StructuredCoachResponseT = z.infer<typeof StructuredCoachResponse>;

/**
 * Convert structured response to natural language
 */
export function structuredToNaturalLanguage(response: StructuredCoachResponseT): string {
  // Handle case where no data is available - return a single clean message
  if (!response.grounding.dataAvailable) {
    const limitation = response.meta.dataLimitations || 'No specific data available for this question';
    return `I don't have enough specific data to answer that question fully. ${limitation}. ` +
           `Try asking about your openings, recent games, or specific opponents!`;
  }

  const parts: string[] = [];

  // Main advice - skip if it's just a "no data" message
  const mainPoint = response.advice.mainPoint.trim();
  if (mainPoint && !mainPoint.toLowerCase().includes("don't have relevant data")) {
    parts.push(mainPoint);
  }

  // Explanation - skip if it's just a "no data" message or duplicate
  const explanation = response.advice.explanation.trim();
  if (explanation &&
      !explanation.toLowerCase().includes("don't have relevant data") &&
      explanation !== mainPoint) {
    parts.push(explanation);
  }

  // Action item - skip if it's just a "no data" message
  const actionItem = response.advice.actionItem?.trim();
  if (actionItem && !actionItem.toLowerCase().includes("don't have relevant data")) {
    parts.push(`Try this: ${actionItem}`);
  }

  // Data limitation disclaimer if low confidence
  if (response.meta.confidenceLevel === 'low' && response.meta.dataLimitations) {
    parts.push(`(Note: ${response.meta.dataLimitations})`);
  }

  // If we filtered everything out, return a helpful default
  if (parts.length === 0) {
    return "I couldn't find specific data for that question in your games. " +
           "Try asking about your openings, common mistakes, or recent opponents!";
  }

  return parts.join(' ');
}

/**
 * Verify grounding claims against actual context
 */
export function verifyGrounding(
  response: StructuredCoachResponseT,
  contextGames: Array<{ gameId: string; opponent: string }>,
  contextPositions: Array<{ moveNumber: number }>
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Verify all referenced games exist in context
  for (const gameRef of response.grounding.gamesReferenced) {
    if (gameRef.verifiedInContext) {
      const exists = contextGames.some(
        g => g.gameId === gameRef.gameId || g.opponent === gameRef.opponent
      );
      if (!exists) {
        issues.push(`Referenced game vs ${gameRef.opponent} not found in context`);
      }
    }
  }

  // Verify all referenced positions exist in context
  for (const posRef of response.grounding.positionsReferenced) {
    const exists = contextPositions.some(
      p => Math.abs(p.moveNumber - posRef.moveNumber) <= 1  // Allow off-by-one
    );
    if (!exists) {
      issues.push(`Referenced position at move ${posRef.moveNumber} not found in context`);
    }
  }

  // Check for impossible claims
  if (!response.grounding.dataAvailable && response.grounding.gamesReferenced.length > 0) {
    issues.push('Claims no data available but references games');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
