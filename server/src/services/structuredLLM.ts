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
 */
export async function getGroundedResponse(
  question: string,
  content: SelectedContent
): Promise<GroundedResponse> {
  try {
    // Pass 1: Get structured JSON response
    const structuredPrompt = buildStructuredPrompt(question, content);
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

    // Pass 2: Convert to natural language (for complex responses)
    // For simpler responses, we can use the built-in converter
    let naturalLanguage: string;

    if (structured.advice.explanation.length > 100) {
      // Use second LLM pass for longer explanations
      const naturalPrompt = buildNaturalLanguagePrompt(structured);
      naturalLanguage = await getLLMResponseSync(naturalPrompt);
    } else {
      // Use simple conversion for shorter responses
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
 * Build prompt for structured JSON response (Pass 1)
 */
function buildStructuredPrompt(question: string, content: SelectedContent): string {
  return `You are a chess coach assistant. Your task is to analyze the context below and generate a STRUCTURED JSON response.

═══════════════════════════════════════════════════════════════════════════════
CRITICAL INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════════════════

1. Output ONLY valid JSON, no other text
2. ONLY reference games and positions that appear in the CONTEXT below
3. Set "verifiedInContext" to true ONLY if the game is in SELECTED GAMES
4. If dataAvailable is false, leave advice as "I don't have relevant data"
5. Be specific - use exact opponent names and dates from context

═══════════════════════════════════════════════════════════════════════════════
CONTEXT (Your ONLY source of truth):
═══════════════════════════════════════════════════════════════════════════════

${content.coachingContext}

═══════════════════════════════════════════════════════════════════════════════
USER'S QUESTION: ${question}
═══════════════════════════════════════════════════════════════════════════════

Generate a response in this EXACT JSON format:

{
  "grounding": {
    "questionUnderstood": "brief restatement of what user is asking (max 100 chars)",
    "dataAvailable": true or false,
    "gamesReferenced": [
      {"gameId": "from context", "opponent": "exact name", "date": "from context", "verifiedInContext": true}
    ],
    "positionsReferenced": [
      {"moveNumber": 15, "description": "brief description", "evaluationChange": "-2.5"}
    ]
  },
  "advice": {
    "mainPoint": "one sentence main advice (max 200 chars)",
    "explanation": "2-3 sentences explaining why (max 400 chars)",
    "actionItem": "one specific thing to practice (max 150 chars, optional)"
  },
  "meta": {
    "confidenceLevel": "high" or "medium" or "low",
    "dataLimitations": "any caveats (optional)"
  }
}

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
