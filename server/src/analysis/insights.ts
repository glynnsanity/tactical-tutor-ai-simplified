import type { Pattern } from './patterns';
import type { CompactGameSummaryT } from '../summaries/schemas';

export interface Insight {
  id: string;
  title: string;
  summary: string; // 2-3 sentence overview
  impact: string; // "This costs you ~X rating points"
  priority: number; // 1-10
  category: 'weakness' | 'strength' | 'opening' | 'phase' | 'general';
  
  // Supporting patterns
  patterns: Pattern[];
  
  // Actionable recommendations
  actionPlan: {
    immediate: string; // One thing to do right now
    nextGames: string[]; // Focus areas for next 10 games
    studyPlan: string[]; // Specific topics to study
    resources?: string[]; // Optional study resources
  };
  
  // Evidence
  evidence: {
    totalGames: number;
    totalPositions: number;
    exampleGames: Array<{
      gameId: string;
      opponent: string | null;
      chesscomUrl: string | null;
      moveNo: number;
      fen: string;
      description: string;
      evalLoss: number;
    }>;
  };
  
  // Meta information
  estimatedRatingImpact: number; // Rating points
  confidence: number; // 0-1
}

/**
 * Generate actionable insights from discovered patterns
 */
export function generateInsights(
  patterns: Pattern[],
  summaries: CompactGameSummaryT[]
): Insight[] {
  console.log(`\n💡 Generating insights from ${patterns.length} patterns...`);
  
  const insights: Insight[] = [];
  
  // === INSIGHT 1: Biggest Weakness ===
  const topWeakness = patterns
    .filter(p => p.type === 'weakness')
    .sort((a, b) => b.priority - a.priority)[0];
  
  if (topWeakness) {
    insights.push(generateWeaknessInsight(topWeakness, summaries));
  }
  
  // === INSIGHT 2: Opening Analysis ===
  // Only include if it's not the same as the top weakness
  const openingPatterns = patterns.filter(p => p.conditions.opening_eco);
  if (openingPatterns.length >= 2) {
    // Best opening = least negative impact (or positive if it's a strength)
    const bestOpening = openingPatterns
      .filter(p => p.type === 'strength')  // Only actual strengths
      .sort((a, b) => b.impact - a.impact)[0]
      || openingPatterns  // Or least bad weakness
        .filter(p => p.type === 'weakness')
        .sort((a, b) => b.impact - a.impact)[0];  // Least negative = best
    
    const worstOpening = openingPatterns
      .filter(p => p.type === 'weakness')
      .sort((a, b) => a.impact - b.impact)[0];  // Most negative = worst
    
    // Don't duplicate if worst opening is already shown as main weakness
    const isDuplicate = topWeakness && worstOpening && topWeakness.id === worstOpening.id;
    
    if (bestOpening && worstOpening && bestOpening.id !== worstOpening.id && !isDuplicate) {
      insights.push(generateOpeningInsight(worstOpening, bestOpening, summaries));
    }
  }
  
  // === INSIGHT 3: Game Phase Analysis ===
  const phaseInsight = generatePhaseInsight(patterns, summaries);
  if (phaseInsight) {
    insights.push(phaseInsight);
  }
  
  // === INSIGHT 4: Top Strength (if exists) ===
  const topStrength = patterns
    .filter(p => p.type === 'strength')
    .sort((a, b) => b.priority - a.priority)[0];
  
  if (topStrength) {
    insights.push(generateStrengthInsight(topStrength, summaries));
  }
  
  // === INSIGHT 5: General Performance Overview ===
  insights.push(generateOverviewInsight(patterns, summaries));
  
  console.log(`✅ Generated ${insights.length} insights\n`);
  
  // Sort by priority
  return insights.sort((a, b) => b.priority - a.priority);
}

function generateWeaknessInsight(pattern: Pattern, summaries: CompactGameSummaryT[]): Insight {
  const gameIds = new Set(pattern.gameIds); // Use the gameIds from pattern, not just examples
  const gamesAffected = summaries.filter(g => gameIds.has(g.gameId));
  
  // Calculate rating impact (rough estimate: 100cp = 30 rating points)
  const totalCpLoss = Math.abs(pattern.impact * pattern.frequency);
  const estimatedRatingImpact = Math.round(totalCpLoss / 100 * 0.3);
  
  const exampleGames = pattern.examples.slice(0, 3).map(ex => {
    const game = summaries.find(g => g.gameId === ex.gameId);
    return {
      gameId: ex.gameId,
      opponent: game?.opponent || 'Unknown',
      chesscomUrl: game?.chesscomUrl || null,
      moveNo: ex.moveNo,
      fen: ex.fen,
      description: `Move ${ex.moveNo}: Lost ${Math.abs(ex.evalSwing)}cp due to ${pattern.name.toLowerCase()}`,
      evalLoss: ex.evalSwing
    };
  });
  
  // Different summary based on whether it's a correlation pattern or not
  const isCorrelationPattern = pattern.id.startsWith('corr_');
  const correlationText = isCorrelationPattern 
    ? `and shows a ${Math.abs(pattern.correlation) > 0.5 ? 'strong' : 'moderate'} correlation with position deterioration (${pattern.correlation.toFixed(2)} coefficient)`
    : `especially in specific game situations`;
  
  return {
    id: 'weakness_main',
    title: `Your Biggest Weakness: ${pattern.name}`,
    summary: `This pattern appears in ${pattern.frequency} positions across ${gameIds.size} games ${correlationText}. ${pattern.description} On average, when this pattern appears, you lose ${Math.abs(pattern.impact)}cp of evaluation.`,
    impact: `This costs you approximately ${estimatedRatingImpact} rating points`,
    priority: 10,
    category: 'weakness',
    patterns: [pattern],
    actionPlan: {
      immediate: generateImmediateAction(pattern.name),
      nextGames: [
        `Before each move, specifically check for ${pattern.name.toLowerCase()}`,
        `If you spot ${pattern.name.toLowerCase()}, take extra time to find an alternative`,
        `After each game, review positions where ${pattern.name.toLowerCase()} occurred`
      ],
      studyPlan: [
        pattern.recommendation,
        `Analyze master games focusing on how they handle ${pattern.name.toLowerCase()}`,
        `Solve tactical puzzles specifically related to ${getCategoryForPattern(pattern.name)}`
      ],
      resources: [
        `Search YouTube: "chess ${pattern.name.toLowerCase()} explained"`,
        `Chess.com lessons on ${getCategoryForPattern(pattern.name)}`
      ]
    },
    evidence: {
      totalGames: gameIds.size,
      totalPositions: pattern.frequency,
      exampleGames
    },
    estimatedRatingImpact,
    confidence: pattern.confidence
  };
}

function generateOpeningInsight(
  worstOpening: Pattern,
  bestOpening: Pattern,
  summaries: CompactGameSummaryT[]
): Insight {
  const worstGames = summaries.filter(g => g.opening.eco === worstOpening.conditions.opening_eco);
  const bestGames = summaries.filter(g => g.opening.eco === bestOpening.conditions.opening_eco);
  
  const worstScore = calculateWinRate(worstGames);
  const bestScore = calculateWinRate(bestGames);
  
  const exampleGames = worstOpening.examples.slice(0, 3).map(ex => {
    const game = summaries.find(g => g.gameId === ex.gameId);
    return {
      gameId: ex.gameId,
      opponent: game?.opponent || 'Unknown',
      chesscomUrl: game?.chesscomUrl || null,
      moveNo: ex.moveNo,
      fen: ex.fen,
      description: `${worstOpening.name} - Critical mistake at move ${ex.moveNo}`,
      evalLoss: ex.evalSwing
    };
  });
  
  const ratingImpact = Math.round(Math.abs(worstOpening.impact) * worstOpening.frequency / 100 * 0.3);
  
  return {
    id: 'opening_analysis',
    title: `Opening Focus: Improve Your ${worstOpening.name}`,
    summary: `Your best opening is ${bestOpening.name} (${(bestScore * 100).toFixed(0)}% score, ${Math.abs(bestOpening.impact)}cp avg loss). Your weakest is ${worstOpening.name} (${(worstScore * 100).toFixed(0)}% score, ${Math.abs(worstOpening.impact)}cp avg loss). ${worstOpening.description}`,
    impact: `Improving this opening could gain you ~${ratingImpact} rating points`,
    priority: 9,
    category: 'opening',
    patterns: [worstOpening, bestOpening],
    actionPlan: {
      immediate: `Study 3 master games in ${worstOpening.name} today`,
      nextGames: [
        `Play ${worstOpening.name} deliberately in your next 5 games`,
        `Focus on understanding typical middlegame plans in this opening`,
        `Review your games in this opening after each one`
      ],
      studyPlan: [
        worstOpening.recommendation,
        `Learn the key pawn breaks and piece maneuvers in ${worstOpening.name}`,
        `Study typical mistakes to avoid in this opening`
      ],
      resources: [
        `Search: "${worstOpening.name} repertoire"`,
        `Chessable course on ${worstOpening.name}`,
        `Chess.com Opening Explorer for ${worstOpening.conditions.opening_eco}`
      ]
    },
    evidence: {
      totalGames: worstGames.length,
      totalPositions: worstOpening.frequency,
      exampleGames
    },
    estimatedRatingImpact: ratingImpact,
    confidence: worstOpening.confidence
  };
}

function generatePhaseInsight(patterns: Pattern[], summaries: CompactGameSummaryT[]): Insight | null {
  // Analyze performance by game phase
  const allGames = summaries;
  
  // Group patterns by phase
  const byPhase = {
    opening: patterns.filter(p => p.conditions.game_phase === 'opening'),
    middlegame: patterns.filter(p => p.conditions.game_phase === 'middlegame'),
    endgame: patterns.filter(p => p.conditions.game_phase === 'endgame')
  };
  
  // Find weakest phase
  const phaseStats = Object.entries(byPhase)
    .map(([phase, pats]) => ({
      phase,
      patterns: pats,
      avgImpact: pats.length > 0 ? pats.reduce((sum, p) => sum + p.impact, 0) / pats.length : 0,
      count: pats.reduce((sum, p) => sum + p.frequency, 0)
    }))
    .filter(p => p.count > 5) // Need enough data
    .sort((a, b) => a.avgImpact - b.avgImpact);
  
  if (phaseStats.length === 0) return null;
  
  const weakestPhase = phaseStats[0];
  const strongestPhase = phaseStats[phaseStats.length - 1];
  
  const ratingImpact = Math.round(Math.abs(weakestPhase.avgImpact) * weakestPhase.count / 100 * 0.3);
  
  // Get examples from weakest phase patterns
  const examples = weakestPhase.patterns
    .flatMap(p => p.examples)
    .slice(0, 3)
    .map(ex => {
      const game = summaries.find(g => g.gameId === ex.gameId);
      return {
        gameId: ex.gameId,
        opponent: game?.opponent || 'Unknown',
        chesscomUrl: game?.chesscomUrl || null,
        moveNo: ex.moveNo,
        fen: ex.fen,
        description: `${weakestPhase.phase} mistake at move ${ex.moveNo}`,
        evalLoss: ex.evalSwing
      };
    });
  
  return {
    id: 'phase_analysis',
    title: `Game Phase: Focus on Your ${weakestPhase.phase}`,
    summary: `Your performance varies significantly by game phase. Your strongest phase is ${strongestPhase.phase} (${Math.abs(strongestPhase.avgImpact)}cp avg), but you struggle in the ${weakestPhase.phase} (${Math.abs(weakestPhase.avgImpact)}cp avg loss across ${weakestPhase.count} positions). This phase accounts for a significant portion of your losses.`,
    impact: `Improving your ${weakestPhase.phase} play could gain you ~${ratingImpact} rating points`,
    priority: 8,
    category: 'phase',
    patterns: weakestPhase.patterns,
    actionPlan: {
      immediate: `Watch one instructional video on ${weakestPhase.phase} strategy tonight`,
      nextGames: [
        `Pay extra attention during the ${weakestPhase.phase}`,
        `Slow down and calculate more carefully in ${weakestPhase.phase} positions`,
        `After each game, analyze your ${weakestPhase.phase} specifically`
      ],
      studyPlan: [
        `Study ${weakestPhase.phase} fundamentals`,
        `Solve puzzles specifically from ${weakestPhase.phase} positions`,
        `Learn typical plans and patterns for ${weakestPhase.phase}`
      ],
      resources: [
        `YouTube: "chess ${weakestPhase.phase} strategy"`,
        `Chess.com: ${weakestPhase.phase} lessons`,
        `Chessable: ${weakestPhase.phase} course`
      ]
    },
    evidence: {
      totalGames: allGames.length,
      totalPositions: weakestPhase.count,
      exampleGames: examples
    },
    estimatedRatingImpact: ratingImpact,
    confidence: 0.8
  };
}

function generateStrengthInsight(pattern: Pattern, summaries: CompactGameSummaryT[]): Insight {
  const gameIds = new Set(pattern.gameIds); // Use the gameIds from pattern, not just examples
  
  const exampleGames = pattern.examples.slice(0, 3).map(ex => {
    const game = summaries.find(g => g.gameId === ex.gameId);
    return {
      gameId: ex.gameId,
      opponent: game?.opponent || 'Unknown',
      chesscomUrl: game?.chesscomUrl || null,
      moveNo: ex.moveNo,
      fen: ex.fen,
      description: `Strong ${pattern.name.toLowerCase()} at move ${ex.moveNo}`,
      evalLoss: ex.evalSwing
    };
  });
  
  return {
    id: 'strength_main',
    title: `Your Biggest Strength: ${pattern.name}`,
    summary: `You excel at ${pattern.name.toLowerCase()}, which appears in ${pattern.frequency} positions. This pattern correlates with improved positions (${pattern.correlation.toFixed(2)} correlation) and gains you an average of ${Math.abs(pattern.impact)}cp when present.`,
    impact: `This strength is worth about +${Math.round(pattern.impact * pattern.frequency / 100 * 0.3)} rating points`,
    priority: 7,
    category: 'strength',
    patterns: [pattern],
    actionPlan: {
      immediate: `Recognize and leverage your ${pattern.name.toLowerCase()} in today's games`,
      nextGames: [
        `Actively look for opportunities to use ${pattern.name.toLowerCase()}`,
        `Trust your instincts when ${pattern.name.toLowerCase()} is involved`,
        `Study your successful games to understand why this works for you`
      ],
      studyPlan: [
        pattern.recommendation,
        `Learn advanced techniques related to ${pattern.name.toLowerCase()}`,
        `Study how masters maximize this advantage`
      ]
    },
    evidence: {
      totalGames: gameIds.size,
      totalPositions: pattern.frequency,
      exampleGames
    },
    estimatedRatingImpact: Math.round(pattern.impact * pattern.frequency / 100 * 0.3),
    confidence: pattern.confidence
  };
}

function generateOverviewInsight(patterns: Pattern[], summaries: CompactGameSummaryT[]): Insight {
  const totalGames = summaries.length;
  const winRate = calculateWinRate(summaries);
  
  const weaknesses = patterns.filter(p => p.type === 'weakness');
  const strengths = patterns.filter(p => p.type === 'strength');
  
  // Calculate total potential rating gain from fixing top 3 UNIQUE weaknesses
  // (avoid counting the same pattern multiple times)
  const top3Weaknesses = weaknesses.slice(0, 3);
  const uniquePatternIds = new Set<string>();
  const potentialGain = top3Weaknesses.reduce((sum, p) => {
    // Skip if we've already counted a similar pattern
    if (uniquePatternIds.has(p.id)) return sum;
    uniquePatternIds.add(p.id);
    return sum + Math.round(Math.abs(p.impact) * p.frequency / 100 * 0.3);
  }, 0);
  
  const avgRating = summaries.reduce((sum, g) => sum + (g.userRating ?? 1200), 0) / summaries.length;
  
  return {
    id: 'overview',
    title: 'Performance Overview & Next Steps',
    summary: `Across ${totalGames} games (${(winRate * 100).toFixed(1)}% score, ~${Math.round(avgRating)} rating), we identified ${patterns.length} significant patterns: ${weaknesses.length} weaknesses and ${strengths.length} strengths. Your top 3 weaknesses account for an estimated ${potentialGain} rating point deficit. Focus on these and you could jump ${potentialGain} points!`,
    impact: `Potential rating gain: +${potentialGain} points by fixing top weaknesses`,
    priority: 6,
    category: 'general',
    patterns: [...top3Weaknesses, ...strengths.slice(0, 2)],
    actionPlan: {
      immediate: 'Review your top weakness insight above and implement the immediate action',
      nextGames: [
        'Focus on one weakness at a time - start with the highest priority',
        'Use a pre-move checklist based on your main weaknesses',
        'Review every game to identify when your patterns appear'
      ],
      studyPlan: [
        'Dedicate 80% of study time to your top 3 weaknesses',
        'Spend 20% reinforcing your strengths',
        'Track progress by reviewing these insights monthly'
      ]
    },
    evidence: {
      totalGames,
      totalPositions: patterns.reduce((sum, p) => sum + p.frequency, 0),
      exampleGames: []
    },
    estimatedRatingImpact: potentialGain,
    confidence: 0.9
  };
}

// === HELPER FUNCTIONS ===

function calculateWinRate(games: CompactGameSummaryT[]): number {
  if (games.length === 0) return 0;
  const wins = games.filter(g => g.result === 'win').length;
  const draws = games.filter(g => g.result === 'draw').length;
  return (wins + draws * 0.5) / games.length;
}

function generateImmediateAction(patternName: string): string {
  const actions: Record<string, string> = {
    'Hanging Pieces': 'Right now, write on a note: "Before every move: Are all my pieces defended?" Put it next to your board.',
    'King in Center': 'In your next game, prioritize castling within the first 10 moves unless there\'s a strong tactical reason not to.',
    'Doubled Pawns': 'Before capturing with a pawn, ask: "Will this double my pawns? Is it worth it?"',
    'Isolated Pawns': 'Study one video on isolated pawns tonight to understand when they\'re weak vs strong',
    'Development': 'In your next 3 games, focus on developing all minor pieces before moving any piece twice',
    'Pawn Islands': 'Watch a 10-minute video on pawn structure fundamentals right now',
  };
  
  return actions[patternName] || `Review the detailed recommendations for ${patternName} and choose one action to implement immediately`;
}

function getCategoryForPattern(patternName: string): string {
  if (patternName.includes('Pawn')) return 'pawn structure';
  if (patternName.includes('King')) return 'king safety';
  if (patternName.includes('Hanging') || patternName.includes('Attack')) return 'tactics';
  if (patternName.includes('Development') || patternName.includes('Center')) return 'strategy';
  if (patternName.includes('Mobility') || patternName.includes('Bishop') || patternName.includes('Rook')) return 'piece activity';
  return 'chess fundamentals';
}

