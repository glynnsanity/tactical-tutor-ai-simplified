/**
 * Two-Pass LLM for Grounded Responses
 *
 * Pass 1: Generate structured JSON with explicit grounding verification
 * Pass 2: Convert validated JSON to natural language
 *
 * This approach catches hallucinations before they reach the user
 */

import {
  StructuredCoachResponse,
  type StructuredCoachResponseT,
  structuredToNaturalLanguage,
  verifyGrounding,
} from '../schemas/coachResponse';
import type { SelectedContent } from '../selection/contentSelector';
import { streamAnswer } from './llm';
import type { IntentAnalysis } from './intentAnalyzer';

export interface GroundedResponseResult {
  success: true;
  structured: StructuredCoachResponseT;
  naturalLanguage: string;
  groundingValid: boolean;
  groundingIssues: string[];
}

export interface GroundedResponseError {
  success: false;
  error: string;
  fallbackResponse: string;
}

export type GroundedResponse = GroundedResponseResult | GroundedResponseError;

/**
 * Get a grounded response using two-pass LLM approach
 * Now accepts optional IntentAnalysis for smarter prompt construction
 */
export async function getGroundedResponse(
  question: string,
  content: SelectedContent,
  intent?: IntentAnalysis
): Promise<GroundedResponse> {
  try {
    // Pass 1: Get structured JSON response
    const structuredPrompt = buildStructuredPrompt(question, content, intent);

    // LOG THE FULL PROMPT FOR DEBUGGING
    console.log('\n\n========== FULL PROMPT SENT TO LLM ==========');
    console.log(structuredPrompt);
    console.log('========== END OF PROMPT ==========\n\n');

    const rawJson = await getLLMResponseSync(structuredPrompt);

    // Parse and validate the JSON
    let structured: StructuredCoachResponseT;
    try {
      const cleaned = extractJsonFromResponse(rawJson);
      const parsed = JSON.parse(cleaned);
      structured = StructuredCoachResponse.parse(parsed);
    } catch (parseError) {
      console.error('[StructuredLLM] Failed to parse JSON:', parseError);
      return {
        success: false,
        error: `Failed to parse structured response: ${parseError}`,
        fallbackResponse: generateFallbackResponse(question, content),
      };
    }

    // Verify grounding claims against actual context
    const contextGames = content.games.map(g => ({ gameId: g.gameId, opponent: g.opponent }));
    const contextPositions = content.positions.map(p => ({ moveNumber: p.moveNumber }));
    const groundingResult = verifyGrounding(structured, contextGames, contextPositions);

    if (!groundingResult.valid) {
      console.warn('[StructuredLLM] Grounding verification failed:', groundingResult.issues);

      // If grounding fails, try to fix or use fallback
      if (groundingResult.issues.length > 2) {
        return {
          success: false,
          error: `Grounding verification failed: ${groundingResult.issues.join(', ')}`,
          fallbackResponse: generateFallbackResponse(question, content),
        };
      }
    }

    // Pass 2: Convert to natural language (for complex responses only)
    // Quick Win #3: Skip Pass 2 for most responses - use built-in converter
    let naturalLanguage: string;

    if (structured.advice.explanation.length > 300) {
      // Only use second LLM pass for very long/complex explanations
      const naturalPrompt = buildNaturalLanguagePrompt(structured);
      naturalLanguage = await getLLMResponseSync(naturalPrompt);
    } else {
      // Use simple conversion for most responses (saves 1 LLM call)
      naturalLanguage = structuredToNaturalLanguage(structured);
    }

    return {
      success: true,
      structured,
      naturalLanguage,
      groundingValid: groundingResult.valid,
      groundingIssues: groundingResult.issues,
    };

  } catch (error) {
    console.error('[StructuredLLM] Unexpected error:', error);
    return {
      success: false,
      error: `Unexpected error: ${error}`,
      fallbackResponse: generateFallbackResponse(question, content),
    };
  }
}

/**
 * Build guidance based on intent analysis
 * Quick Win #5: Compact format to reduce token usage
 */
function buildIntentGuidance(intent: IntentAnalysis): string {
  const parts: string[] = [];

  // Compact intent header
  parts.push(`\n## INTENT: ${intent.intent} (${intent.scope}, ${intent.confidence})`);

  // Pattern analysis guidance (compact)
  if (intent.requiresPatternAnalysis) {
    parts.push(`PATTERN MODE: Synthesize across MULTIPLE games. Cite stats ("In 5 of 8 games..."). Don't focus on just one game.`);
  }

  // Specific examples guidance (compact)
  if (intent.requiresSpecificExamples && !intent.requiresPatternAnalysis) {
    parts.push(`EXAMPLES MODE: Reference specific games with opponent names, dates, exact moves, eval changes.`);
  }

  // Factual only guidance (compact)
  if (intent.isFactualOnly) {
    parts.push(`FACTUAL MODE: Lead with direct answer. Stats/numbers first, minimal coaching.`);
  }

  // Scope hint
  const scopeHints: Record<string, string> = {
    pattern: 'Focus: recurring themes across games',
    single_game: 'Focus: detailed analysis of specific game',
    historical: 'Focus: all-time stats and trends',
    advice: 'Focus: actionable improvement recommendations',
    comparison: 'Focus: compare performance across contexts',
  };
  if (scopeHints[intent.scope]) {
    parts.push(scopeHints[intent.scope]);
  }

  // Key context
  if (intent.contextNeeded.length > 0) {
    parts.push(`Use: ${intent.contextNeeded.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Fallback: Detect if this is a pattern-level question using keywords
 * Used when no IntentAnalysis is provided
 */
function isPatternQuestionFallback(question: string): boolean {
  const q = question.toLowerCase();
  return /weak|strength|pattern|improve|better|worse|problem|issue|tend to|usually|keep|always|biggest|main|common|recurring|overall|in general|suck|struggle/i.test(q);
}

/**
 * Build prompt for structured JSON response (Pass 1)
 * Now uses IntentAnalysis when available for smarter guidance
 */
function buildStructuredPrompt(
  question: string,
  content: SelectedContent,
  intent?: IntentAnalysis
): string {
  // Build guidance section based on intent analysis or fallback
  let guidanceSection: string;

  if (intent) {
    // Use intelligent intent-based guidance
    guidanceSection = buildIntentGuidance(intent);
  } else {
    // Fallback to keyword-based pattern detection (compact)
    const isPattern = isPatternQuestionFallback(question) && content.profile;
    guidanceSection = isPattern ? `
## PATTERN MODE
Synthesize across MULTIPLE games. Cite stats ("In 5 of 8 games..."). Use games as examples only. Don't focus on one game.
` : '';
  }

  // Determine data availability for context-aware rules
  const hasGames = content.games.length > 0;
  const hasPositions = content.positions.length > 0;
  const hasData = hasGames || hasPositions;

  // Build context-aware rules based on actual data availability
  let rulesSection: string;
  if (hasData) {
    // Data IS available - instruct LLM to USE it
    rulesSection = `## RULES
1. Output ONLY valid JSON
2. You HAVE data available - use the games and positions in CONTEXT below
3. Reference the SPECIFIC opponent names, dates, and move numbers provided
4. Include eval changes when discussing positions (e.g., "+1.5 to -2.0")
5. Set dataAvailable=true since context contains ${content.games.length} game(s) and ${content.positions.length} position(s)`;
  } else {
    // No data - instruct LLM to indicate this
    rulesSection = `## RULES
1. Output ONLY valid JSON
2. NO game data is available in context - set dataAvailable=false
3. Provide general chess advice without referencing specific games
4. Suggest what would help (e.g., "play more games", "try different openings")`;
  }

  // Quick Win #5: Trimmed prompt decorations (saves ~15% tokens)
  return `You are a data-driven chess coach. Generate a STRUCTURED JSON response.
${guidanceSection}

## GOOD ADVICE
- SPECIFIC: "In your game vs Smith on Jan 15, move 34 Rxe4 had a big eval swing"
- QUANTIFIED: "You lost 3 of 5 games where you reached a rook endgame"
- ACTIONABLE: "Practice Lucena position puzzles on Lichess"

${rulesSection}

## CONTEXT
${content.coachingContext}

## QUESTION: ${question}

## JSON FORMAT
{"grounding":{"questionUnderstood":"brief (100 chars)","dataAvailable":${hasData},"gamesReferenced":[{"gameId":"","opponent":"","date":"","verifiedInContext":true}],"positionsReferenced":[{"moveNumber":0,"description":"","evaluationChange":""}]},"advice":{"mainPoint":"specific advice (200 chars)","explanation":"why this matters (400 chars)","actionItem":"practice recommendation (150 chars)"},"meta":{"confidenceLevel":"high|medium|low","dataLimitations":""}}

JSON:`;
}

/**
 * Build prompt for natural language conversion (Pass 2)
 */
function buildNaturalLanguagePrompt(structured: StructuredCoachResponseT): string {
  return `Convert this structured coaching response into 2-4 friendly, conversational sentences:

Main point: ${structured.advice.mainPoint}
Explanation: ${structured.advice.explanation}
${structured.advice.actionItem ? `Action item: ${structured.advice.actionItem}` : ''}
${structured.meta.dataLimitations ? `Note: ${structured.meta.dataLimitations}` : ''}

Rules:
- Write in an encouraging, conversational tone for a club-level chess player
- Keep it to 2-4 sentences
- Do NOT include JSON, FEN strings, or [BOARD:...] tags
- Reference specific games/opponents if mentioned above

Natural language response:`;
}

/**
 * Extract JSON from LLM response (handles code blocks)
 */
function extractJsonFromResponse(raw: string): string {
  // Try to find JSON in markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }

  // Try to find raw JSON object
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Return as-is and let JSON.parse fail with clear error
  return raw;
}

/**
 * Generate a fallback response when structured approach fails
 */
function generateFallbackResponse(question: string, content: SelectedContent): string {
  if (content.games.length === 0) {
    return "I don't have enough game data to provide specific advice on this topic.";
  }

  const opponent = content.games[0]?.opponent || 'your opponent';
  const opening = content.games[0]?.opening?.name || 'the opening';

  return `Based on your games, I'd suggest focusing on the fundamentals: ` +
         `develop your pieces efficiently, control the center, and ensure king safety. ` +
         `Your game against ${opponent} in ${opening} shows areas for improvement.`;
}

/**
 * Synchronous LLM call (collects streaming response)
 */
async function getLLMResponseSync(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullResponse = '';

    streamAnswer({
      system: prompt,
      user: '',
      onToken: (token: string) => {
        fullResponse += token;
      },
      onDone: () => {
        resolve(fullResponse);
      },
    }).catch(reject);
  });
}
