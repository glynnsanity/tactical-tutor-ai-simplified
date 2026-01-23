/**
 * Fuzzy Opening Matcher
 * Provides accurate opening detection using multiple matching strategies
 */

import { ECO_DATABASE, OPENING_FAMILIES, getEcoCodesForFamily, type OpeningInfo } from '../data/ecoDatabase';

export interface OpeningMatch {
  matched: boolean;
  opening: OpeningInfo | null;
  confidence: number;  // 0-1 scale
  matchType: 'exact' | 'alias' | 'partial' | 'family' | 'fuzzy' | 'none';
  ecoCodes: string[];  // All ECO codes that should match
  family: string | null;
}

/**
 * Match an opening name/query to ECO codes using multiple strategies
 * Strategies tried in order: exact → alias → partial → family keyword → fuzzy
 */
export function matchOpening(query: string): OpeningMatch {
  const normalized = query.toLowerCase().trim();

  if (!normalized || normalized.length < 2) {
    return noMatch();
  }

  // Strategy 1: Exact name match
  const exactMatch = ECO_DATABASE.find(o =>
    o.name.toLowerCase() === normalized
  );
  if (exactMatch) {
    return {
      matched: true,
      opening: exactMatch,
      confidence: 1.0,
      matchType: 'exact',
      ecoCodes: getEcoCodesForFamily(exactMatch.family),
      family: exactMatch.family,
    };
  }

  // Strategy 2: Exact alias match
  const aliasMatch = ECO_DATABASE.find(o =>
    o.aliases.some(alias => alias.toLowerCase() === normalized)
  );
  if (aliasMatch) {
    return {
      matched: true,
      opening: aliasMatch,
      confidence: 0.95,
      matchType: 'alias',
      ecoCodes: getEcoCodesForFamily(aliasMatch.family),
      family: aliasMatch.family,
    };
  }

  // Strategy 3: Check for family keywords (e.g., "sicilian" anywhere in query)
  for (const [familyName, familyInfo] of Object.entries(OPENING_FAMILIES)) {
    for (const keyword of familyInfo.keywords) {
      if (normalized.includes(keyword)) {
        // Find the main opening for this family
        const mainOpening = ECO_DATABASE.find(o => o.family === familyName);
        return {
          matched: true,
          opening: mainOpening || null,
          confidence: 0.9,
          matchType: 'family',
          ecoCodes: getEcoCodesForFamily(familyName),
          family: familyName,
        };
      }
    }
  }

  // Strategy 4: Partial/contains match (name contains query or query contains name)
  const partialMatches: Array<{ opening: OpeningInfo; score: number }> = [];

  for (const opening of ECO_DATABASE) {
    const nameLower = opening.name.toLowerCase();

    // Check if query is contained in opening name
    if (nameLower.includes(normalized)) {
      const score = normalized.length / nameLower.length; // Longer match = better
      partialMatches.push({ opening, score: score * 0.85 });
    }
    // Check if opening name is contained in query
    else if (normalized.includes(nameLower)) {
      const score = nameLower.length / normalized.length;
      partialMatches.push({ opening, score: score * 0.8 });
    }

    // Check aliases
    for (const alias of opening.aliases) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower.includes(normalized)) {
        const score = normalized.length / aliasLower.length;
        partialMatches.push({ opening, score: score * 0.82 });
      } else if (normalized.includes(aliasLower)) {
        const score = aliasLower.length / normalized.length;
        partialMatches.push({ opening, score: score * 0.78 });
      }
    }
  }

  if (partialMatches.length > 0) {
    // Sort by score and take best match
    partialMatches.sort((a, b) => b.score - a.score);
    const best = partialMatches[0];
    if (best.score > 0.5) {
      return {
        matched: true,
        opening: best.opening,
        confidence: best.score,
        matchType: 'partial',
        ecoCodes: getEcoCodesForFamily(best.opening.family),
        family: best.opening.family,
      };
    }
  }

  // Strategy 5: Fuzzy match using Levenshtein distance
  const fuzzyMatch = findFuzzyMatch(normalized);
  if (fuzzyMatch && fuzzyMatch.confidence > 0.65) {
    return fuzzyMatch;
  }

  return noMatch();
}

/**
 * Find fuzzy match using Levenshtein distance
 */
function findFuzzyMatch(query: string): OpeningMatch | null {
  let bestMatch: OpeningInfo | null = null;
  let bestDistance = Infinity;
  let bestTarget = '';

  for (const opening of ECO_DATABASE) {
    // Check name
    const nameDistance = levenshteinDistance(query, opening.name.toLowerCase());
    if (nameDistance < bestDistance) {
      bestDistance = nameDistance;
      bestMatch = opening;
      bestTarget = opening.name;
    }

    // Check aliases
    for (const alias of opening.aliases) {
      const aliasDistance = levenshteinDistance(query, alias.toLowerCase());
      if (aliasDistance < bestDistance) {
        bestDistance = aliasDistance;
        bestMatch = opening;
        bestTarget = alias;
      }
    }
  }

  // Allow up to 3 character edits for reasonable fuzzy matching
  if (bestMatch && bestDistance <= 3) {
    const maxLen = Math.max(query.length, bestTarget.length);
    const confidence = 1 - (bestDistance / maxLen);

    return {
      matched: true,
      opening: bestMatch,
      confidence: Math.max(0.65, confidence * 0.85), // Cap confidence for fuzzy matches
      matchType: 'fuzzy',
      ecoCodes: getEcoCodesForFamily(bestMatch.family),
      family: bestMatch.family,
    };
  }

  return null;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Return a no-match result
 */
function noMatch(): OpeningMatch {
  return {
    matched: false,
    opening: null,
    confidence: 0,
    matchType: 'none',
    ecoCodes: [],
    family: null,
  };
}

/**
 * Extract potential opening names from a question
 * Returns array of candidates to try matching
 */
export function extractOpeningCandidates(question: string): string[] {
  const candidates: string[] = [];
  const normalized = question.toLowerCase();

  // Pattern 1: "in the X" or "with the X" or "about the X"
  const patterns = [
    /(?:in|with|about|play|playing|improve|help|my)\s+(?:the\s+)?([a-z'\-\s]+?)(?:\s+opening|\s+defense|\s+defence|\s+gambit|\s+variation|\s+attack|[?.,!]|$)/gi,
    /([a-z'\-\s]+?)\s+(?:opening|defense|defence|gambit|variation|attack)/gi,
  ];

  for (const pattern of patterns) {
    const matches = question.matchAll(pattern);
    for (const match of matches) {
      const candidate = match[1].trim();
      if (candidate.length >= 3 && candidate.length <= 30) {
        candidates.push(candidate);
      }
    }
  }

  // Pattern 2: Check for any known opening keywords
  for (const familyInfo of Object.values(OPENING_FAMILIES)) {
    for (const keyword of familyInfo.keywords) {
      if (normalized.includes(keyword)) {
        candidates.push(keyword);
      }
    }
  }

  // Deduplicate
  return [...new Set(candidates)];
}

/**
 * Try to match an opening from a question
 * Extracts candidates and tries each one
 */
export function matchOpeningFromQuestion(question: string): OpeningMatch {
  const candidates = extractOpeningCandidates(question);

  // Also try the whole question as a last resort
  candidates.push(question);

  let bestMatch: OpeningMatch = noMatch();

  for (const candidate of candidates) {
    const match = matchOpening(candidate);
    if (match.matched && match.confidence > bestMatch.confidence) {
      bestMatch = match;
    }
  }

  return bestMatch;
}
