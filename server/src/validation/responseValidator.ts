/**
 * Response Validator
 * Verifies LLM responses against actual game data to catch hallucinations
 */

import type { SelectedContent, SelectedGame, SelectedPosition } from '../selection/contentSelector';

export interface ValidationResult {
  isValid: boolean;
  confidence: number;  // 0-1 scale
  issues: ValidationIssue[];
  sanitizedResponse: string;
}

export interface ValidationIssue {
  type: 'hallucinated_opponent' | 'hallucinated_opening' | 'hallucinated_stat' | 'hallucinated_move' | 'ungrounded_claim';
  severity: 'error' | 'warning';
  description: string;
  originalText: string;
  suggestedFix: string | null;
}

interface ExtractedClaim {
  type: 'opponent' | 'opening' | 'result' | 'statistic' | 'move' | 'date';
  text: string;
  value: string;
}

/**
 * Validate LLM response against the actual data provided in context
 */
export function validateResponse(
  response: string,
  content: SelectedContent
): ValidationResult {
  const issues: ValidationIssue[] = [];
  let sanitizedResponse = response;

  // Extract claims from the response
  const claims = extractClaims(response);

  // Validate each claim against the actual data
  for (const claim of claims) {
    const issue = validateClaim(claim, content);
    if (issue) {
      issues.push(issue);

      // For errors, attempt to fix or flag
      if (issue.severity === 'error' && issue.suggestedFix) {
        sanitizedResponse = sanitizedResponse.replace(
          claim.text,
          issue.suggestedFix
        );
      }
    }
  }

  // Calculate confidence based on number and severity of issues
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const confidence = Math.max(0, 1 - (errorCount * 0.3) - (warningCount * 0.1));

  return {
    isValid: errorCount === 0,
    confidence,
    issues,
    sanitizedResponse,
  };
}

/**
 * Extract potential claims from the LLM response
 */
function extractClaims(response: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  // Extract opponent references
  // Patterns: "vs [name]", "against [name]", "played [name]"
  const opponentPatterns = [
    /(?:vs|against|versus|played|playing)\s+([A-Za-z0-9_\-]+)/gi,
    /game(?:s)?\s+(?:against|with|vs)\s+([A-Za-z0-9_\-]+)/gi,
  ];

  for (const pattern of opponentPatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      const value = match[1].trim();
      // Filter out common false positives
      if (!isCommonWord(value)) {
        claims.push({ type: 'opponent', text: match[0], value });
      }
    }
  }

  // Extract opening references
  const openingPatterns = [
    /(Italian|Sicilian|French|Caro-Kann|Queen's Gambit|King's Indian|Ruy Lopez|Spanish|London|Evans Gambit|Scotch|Petroff|Vienna|English|Dutch|Catalan|Nimzo|Grunfeld|Slav|Scandinavian|Pirc|Alekhine|Benoni|Modern|King's Gambit)(?:\s+(?:Game|Defense|Defence|Opening|Gambit|Attack|Variation))?/gi,
  ];

  for (const pattern of openingPatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      claims.push({ type: 'opening', text: match[0], value: match[0] });
    }
  }

  // Extract result claims
  const resultPatterns = [
    /(?:you|your)\s+(won|lost|drew|beat|defeated)/gi,
    /(win|loss|draw|victory|defeat)\s+(?:against|vs)/gi,
  ];

  for (const pattern of resultPatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      claims.push({ type: 'result', text: match[0], value: match[1] || match[0] });
    }
  }

  // Extract statistic claims (percentages, counts)
  const statPatterns = [
    /(\d+(?:\.\d+)?)\s*%/g,  // Percentages
    /(\d+)\s+(?:games?|wins?|losses?|draws?|blunders?|mistakes?|times?)/gi,
  ];

  for (const pattern of statPatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      claims.push({ type: 'statistic', text: match[0], value: match[0] });
    }
  }

  // Extract move references
  const movePatterns = [
    /move\s+(\d+)/gi,
    /(?:played|play|chose|choosing)\s+([A-Za-z][a-z]?\d(?:x[a-z]\d)?(?:[+=])?)/gi,  // SAN notation
  ];

  for (const pattern of movePatterns) {
    const matches = response.matchAll(pattern);
    for (const match of matches) {
      claims.push({ type: 'move', text: match[0], value: match[1] });
    }
  }

  return claims;
}

/**
 * Validate a single claim against the context data
 */
function validateClaim(claim: ExtractedClaim, content: SelectedContent): ValidationIssue | null {
  switch (claim.type) {
    case 'opponent':
      return validateOpponentClaim(claim, content);
    case 'opening':
      return validateOpeningClaim(claim, content);
    case 'statistic':
      return validateStatisticClaim(claim, content);
    case 'move':
      return validateMoveClaim(claim, content);
    default:
      return null;
  }
}

/**
 * Validate opponent name references
 */
function validateOpponentClaim(claim: ExtractedClaim, content: SelectedContent): ValidationIssue | null {
  const claimedOpponent = claim.value.toLowerCase();

  // Check if this opponent exists in the selected games
  const opponentExists = content.games.some(
    g => g.opponent.toLowerCase() === claimedOpponent ||
         g.opponent.toLowerCase().includes(claimedOpponent) ||
         claimedOpponent.includes(g.opponent.toLowerCase())
  );

  if (!opponentExists) {
    // Get actual opponents for suggestion
    const actualOpponents = content.games.map(g => g.opponent);
    const suggestedFix = actualOpponents.length > 0
      ? claim.text.replace(claim.value, actualOpponents[0])
      : null;

    return {
      type: 'hallucinated_opponent',
      severity: 'error',
      description: `Referenced opponent "${claim.value}" not found in provided games. ` +
                   `Available opponents: ${actualOpponents.join(', ') || 'none'}`,
      originalText: claim.text,
      suggestedFix,
    };
  }

  return null;
}

/**
 * Validate opening name references
 */
function validateOpeningClaim(claim: ExtractedClaim, content: SelectedContent): ValidationIssue | null {
  const claimedOpening = claim.value.toLowerCase();

  // Check if this opening exists in the selected games
  const openingExists = content.games.some(g => {
    const gameName = g.opening.name?.toLowerCase() || '';
    return gameName.includes(claimedOpening) ||
           claimedOpening.includes(gameName.split(' ')[0]);
  });

  // If the question is about openings, also check if the claimed opening matches
  if (content.questionType.kind === 'opening') {
    const askedAbout = content.questionType.opening.toLowerCase();

    // Allow if the claimed opening is related to what was asked
    if (claimedOpening.includes(askedAbout) || askedAbout.includes(claimedOpening.split(' ')[0])) {
      // But warn if no games actually feature this opening
      if (!openingExists && content.games.length === 0) {
        return {
          type: 'hallucinated_opening',
          severity: 'error',
          description: `Mentioned "${claim.value}" but no games with this opening were found`,
          originalText: claim.text,
          suggestedFix: null,
        };
      }
    }
  }

  return null;
}

/**
 * Validate statistic claims
 */
function validateStatisticClaim(claim: ExtractedClaim, content: SelectedContent): ValidationIssue | null {
  const stats = content.statistics;
  const text = claim.text.toLowerCase();

  // Check percentage claims
  const percentMatch = claim.text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const claimedPercent = parseFloat(percentMatch[1]);

    // Calculate actual win rate
    const actualWinRate = stats.totalGames > 0
      ? (stats.wins / stats.totalGames) * 100
      : 0;

    // Allow some tolerance (within 10%)
    if (Math.abs(claimedPercent - actualWinRate) > 15) {
      return {
        type: 'hallucinated_stat',
        severity: 'warning',
        description: `Claimed ${claimedPercent}% but actual win rate is ~${actualWinRate.toFixed(0)}%`,
        originalText: claim.text,
        suggestedFix: claim.text.replace(percentMatch[0], `${actualWinRate.toFixed(0)}%`),
      };
    }
  }

  // Check game count claims
  const gameCountMatch = claim.text.match(/(\d+)\s+games?/i);
  if (gameCountMatch) {
    const claimedCount = parseInt(gameCountMatch[1], 10);
    const actualCount = content.games.length;

    // Allow mentioning total games or selected games
    if (claimedCount !== actualCount && claimedCount !== stats.totalGames) {
      return {
        type: 'hallucinated_stat',
        severity: 'warning',
        description: `Claimed ${claimedCount} games but selected ${actualCount} (total: ${stats.totalGames})`,
        originalText: claim.text,
        suggestedFix: null,
      };
    }
  }

  return null;
}

/**
 * Validate move references
 */
function validateMoveClaim(claim: ExtractedClaim, content: SelectedContent): ValidationIssue | null {
  // Check if the move number or move exists in selected positions
  const moveNumberMatch = claim.text.match(/move\s+(\d+)/i);
  if (moveNumberMatch) {
    const claimedMoveNumber = parseInt(moveNumberMatch[1], 10);

    const moveExists = content.positions.some(
      p => p.moveNumber === claimedMoveNumber ||
           Math.abs(p.moveNumber - claimedMoveNumber) <= 1  // Allow off-by-one
    );

    if (!moveExists && content.positions.length > 0) {
      const actualMoves = content.positions.map(p => p.moveNumber);
      return {
        type: 'hallucinated_move',
        severity: 'warning',
        description: `Mentioned move ${claimedMoveNumber} but selected positions are at moves: ${actualMoves.join(', ')}`,
        originalText: claim.text,
        suggestedFix: null,
      };
    }
  }

  return null;
}

/**
 * Check if a word is a common English word (false positive filter)
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'your', 'this', 'that', 'with', 'from', 'have', 'been',
    'were', 'more', 'some', 'well', 'also', 'just', 'good', 'great',
    'white', 'black', 'move', 'game', 'play', 'king', 'queen', 'rook',
    'bishop', 'knight', 'pawn', 'check', 'mate', 'opening', 'defense',
  ]);

  return commonWords.has(word.toLowerCase());
}

/**
 * Generate a validation summary for logging
 */
export function getValidationSummary(result: ValidationResult): string {
  if (result.isValid) {
    return `Validation passed (confidence: ${(result.confidence * 100).toFixed(0)}%)`;
  }

  const errorCount = result.issues.filter(i => i.severity === 'error').length;
  const warningCount = result.issues.filter(i => i.severity === 'warning').length;

  return `Validation failed: ${errorCount} errors, ${warningCount} warnings (confidence: ${(result.confidence * 100).toFixed(0)}%)`;
}
