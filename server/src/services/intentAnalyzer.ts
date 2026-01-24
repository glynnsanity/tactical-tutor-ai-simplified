/**
 * Intent Analyzer
 *
 * Uses LLM to intelligently understand user questions before selecting context.
 * This replaces brittle keyword matching with semantic understanding.
 */

import { streamAnswer } from './llm';

/**
 * The scope of what the user is asking about
 */
export type QuestionScope =
  | 'single_game'      // Analyze one specific game
  | 'pattern'          // Look for patterns across multiple games
  | 'historical'       // All-time stats, counts, trends
  | 'stats'            // Quick factual stats (win rate, record)
  | 'comparison'       // Compare performance (opening vs opening, etc.)
  | 'advice'           // General improvement advice
  | 'specific_position'// Analyze a specific position or move
  | 'unclear';         // Need clarification

/**
 * What context would help answer the question
 */
export type ContextNeeded =
  | 'recent_games'
  | 'weakness_patterns'
  | 'strength_patterns'
  | 'opening_stats'
  | 'endgame_data'
  | 'blunder_positions'
  | 'time_control_breakdown'
  | 'rating_history'
  | 'all_games_summary';

/**
 * Result of intent analysis
 */
export interface IntentAnalysis {
  // What the user is actually trying to learn/achieve
  intent: string;

  // The scope of the question
  scope: QuestionScope;

  // What context would be most helpful
  contextNeeded: ContextNeeded[];

  // Any specific filters mentioned
  filters: {
    opening?: string;
    timeControl?: string;
    color?: 'white' | 'black';
    result?: 'win' | 'loss' | 'draw';
    dateRange?: string;
    opponent?: string;
  };

  // Should we add pattern-level guidance to the response prompt?
  requiresPatternAnalysis: boolean;

  // Should we add specific-game guidance?
  requiresSpecificExamples: boolean;

  // Is this a simple factual question that doesn't need coaching?
  isFactualOnly: boolean;

  // Confidence in the analysis
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Analyze user intent using LLM
 */
export async function analyzeIntent(
  question: string,
  availableData: {
    totalGames: number;
    hasProfile: boolean;
    hasHistoricalStats: boolean;
    openingsPlayed: string[];
    timeControls: string[];
  }
): Promise<IntentAnalysis> {

  const prompt = buildIntentPrompt(question, availableData);

  try {
    const response = await getLLMResponse(prompt);
    const parsed = parseIntentResponse(response);

    console.log('[IntentAnalyzer] Analyzed intent:', JSON.stringify(parsed, null, 2));

    return parsed;
  } catch (error) {
    console.error('[IntentAnalyzer] Failed to analyze intent:', error);
    // Return a safe default
    return getDefaultIntent(question);
  }
}

/**
 * Build the intent analysis prompt
 */
function buildIntentPrompt(
  question: string,
  availableData: {
    totalGames: number;
    hasProfile: boolean;
    hasHistoricalStats: boolean;
    openingsPlayed: string[];
    timeControls: string[];
  }
): string {
  return `You are analyzing a chess player's question to determine what they're really asking for.

AVAILABLE DATA:
- ${availableData.totalGames} games analyzed
- Profile with patterns: ${availableData.hasProfile ? 'Yes' : 'No'}
- Historical stats: ${availableData.hasHistoricalStats ? 'Yes' : 'No'}
- Openings played: ${availableData.openingsPlayed.slice(0, 10).join(', ')}
- Time controls: ${availableData.timeControls.join(', ')}

USER'S QUESTION: "${question}"

Analyze the intent and return ONLY valid JSON (no markdown, no explanation):

{
  "intent": "brief description of what user wants to know (max 100 chars)",
  "scope": "single_game" | "pattern" | "historical" | "stats" | "comparison" | "advice" | "specific_position" | "unclear",
  "contextNeeded": ["recent_games", "weakness_patterns", "strength_patterns", "opening_stats", "endgame_data", "blunder_positions", "time_control_breakdown", "rating_history", "all_games_summary"],
  "filters": {
    "opening": "opening name if mentioned, or null",
    "timeControl": "bullet/blitz/rapid/daily if mentioned, or null",
    "color": "white/black if mentioned, or null",
    "result": "win/loss/draw if mentioned, or null",
    "opponent": "opponent name if mentioned, or null"
  },
  "requiresPatternAnalysis": true/false,
  "requiresSpecificExamples": true/false,
  "isFactualOnly": true/false,
  "confidence": "high" | "medium" | "low"
}

GUIDELINES:
- "pattern" scope: Questions about recurring issues, tendencies, what they "usually" do, weaknesses, strengths
- "single_game" scope: Questions about "last game", "recent game", specific opponent
- "historical" scope: Questions with "how many times", "over time", "career", "history"
- "stats" scope: Simple factual questions like "what's my win rate"
- "requiresPatternAnalysis": true if they want insights across multiple games
- "requiresSpecificExamples": true if they want to see actual game examples
- "isFactualOnly": true if they just want numbers, not coaching advice

Examples:
- "What are my weaknesses?" → scope: "pattern", requiresPatternAnalysis: true
- "Analyze my last game" → scope: "single_game", requiresSpecificExamples: true
- "How many Sicilians have I played?" → scope: "historical", isFactualOnly: true
- "What's my win rate?" → scope: "stats", isFactualOnly: true
- "Why do I keep losing in the endgame?" → scope: "pattern", contextNeeded: ["endgame_data", "weakness_patterns"]
- "Tell me where I suck" → scope: "pattern", requiresPatternAnalysis: true
- "How can I get better?" → scope: "advice", requiresPatternAnalysis: true

JSON:`;
}

/**
 * Parse the LLM response into IntentAnalysis
 */
function parseIntentResponse(response: string): IntentAnalysis {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate and normalize
  return {
    intent: parsed.intent || 'general chess question',
    scope: validateScope(parsed.scope),
    contextNeeded: validateContextNeeded(parsed.contextNeeded),
    filters: {
      opening: parsed.filters?.opening || undefined,
      timeControl: parsed.filters?.timeControl || undefined,
      color: parsed.filters?.color || undefined,
      result: parsed.filters?.result || undefined,
      opponent: parsed.filters?.opponent || undefined,
    },
    requiresPatternAnalysis: Boolean(parsed.requiresPatternAnalysis),
    requiresSpecificExamples: Boolean(parsed.requiresSpecificExamples),
    isFactualOnly: Boolean(parsed.isFactualOnly),
    confidence: validateConfidence(parsed.confidence),
  };
}

/**
 * Validate scope value
 */
function validateScope(scope: string): QuestionScope {
  const validScopes: QuestionScope[] = [
    'single_game', 'pattern', 'historical', 'stats',
    'comparison', 'advice', 'specific_position', 'unclear'
  ];
  return validScopes.includes(scope as QuestionScope)
    ? (scope as QuestionScope)
    : 'unclear';
}

/**
 * Validate context needed array
 */
function validateContextNeeded(contextNeeded: string[]): ContextNeeded[] {
  const validContexts: ContextNeeded[] = [
    'recent_games', 'weakness_patterns', 'strength_patterns',
    'opening_stats', 'endgame_data', 'blunder_positions',
    'time_control_breakdown', 'rating_history', 'all_games_summary'
  ];

  if (!Array.isArray(contextNeeded)) return ['recent_games'];

  return contextNeeded.filter(c =>
    validContexts.includes(c as ContextNeeded)
  ) as ContextNeeded[];
}

/**
 * Validate confidence value
 */
function validateConfidence(confidence: string): 'high' | 'medium' | 'low' {
  if (confidence === 'high' || confidence === 'medium' || confidence === 'low') {
    return confidence;
  }
  return 'medium';
}

/**
 * Get default intent when analysis fails
 */
function getDefaultIntent(question: string): IntentAnalysis {
  // Basic fallback with simple heuristics
  const q = question.toLowerCase();

  const isPattern = /weak|strength|pattern|improve|better|worse|problem|issue|tend to|usually|keep|always/i.test(q);
  const isHistorical = /how many|times|history|career|ever|total/i.test(q);
  const isStats = /win rate|record|stats|statistics/i.test(q);
  const isSingleGame = /last game|recent game|this game|that game/i.test(q);

  return {
    intent: 'chess coaching question',
    scope: isHistorical ? 'historical' : isStats ? 'stats' : isPattern ? 'pattern' : isSingleGame ? 'single_game' : 'advice',
    contextNeeded: isPattern ? ['weakness_patterns', 'recent_games'] : ['recent_games'],
    filters: {},
    requiresPatternAnalysis: isPattern,
    requiresSpecificExamples: !isStats && !isHistorical,
    isFactualOnly: isStats || isHistorical,
    confidence: 'low',
  };
}

/**
 * Get LLM response (non-streaming)
 * Uses Haiku for fast, cheap classification (Quick Win #2: Model Cascading)
 */
async function getLLMResponse(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullResponse = '';

    streamAnswer({
      system: prompt,
      user: '',
      maxTokens: 300,  // Reduced - intent is simple JSON
      model: 'haiku', // Fast model for classification tasks
      onToken: (token: string) => {
        fullResponse += token;
      },
      onDone: () => {
        resolve(fullResponse);
      },
    }).catch(reject);
  });
}
