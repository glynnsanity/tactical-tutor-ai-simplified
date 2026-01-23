import type { PositionFeatures } from './features';
import type { CompactGameSummaryT } from '../summaries/schemas';

export interface Pattern {
  id: string;
  type: 'weakness' | 'strength' | 'tendency' | 'situational';
  name: string;
  description: string;
  
  // Statistical validation
  frequency: number; // How often this pattern appears
  impact: number; // Average eval loss in centipawns (negative = bad)
  confidence: number; // Statistical confidence (0-1)
  correlation: number; // Pearson correlation coefficient
  pValue: number; // Statistical significance
  
  // Conditions (when this pattern appears)
  conditions: Record<string, any>;
  
  // Evidence
  examples: Array<{
    gameId: string;
    moveNo: number;
    fen: string;
    evalSwing: number;
    context: string;
  }>;
  gameIds: string[]; // All unique game IDs where this pattern appears
  
  // Actionability
  priority: number; // 1-10 based on frequency * |impact|
  recommendation: string;
}

interface CorrelationResult {
  feature: string;
  coefficient: number;
  pValue: number;
  avgImpact: number;
  frequency: number;
}

/**
 * Discover patterns through statistical analysis
 */
export function discoverPatterns(
  features: PositionFeatures[],
  options: {
    minFrequency?: number;
    minImpact?: number;
    maxPatterns?: number;
    minCorrelation?: number;
  } = {}
): Pattern[] {
  const {
    minFrequency = 10,
    minImpact = 50, // 0.5 pawns
    maxPatterns = 30,
    minCorrelation = 0.35  // Increased from 0.2 to filter noise
  } = options;
  
  console.log(`\n🔬 Discovering patterns from ${features.length} positions...`);
  console.log(`  Min frequency: ${minFrequency}`);
  console.log(`  Min impact: ${minImpact}cp`);
  console.log(`  Min correlation: ${minCorrelation}`);
  
  const patterns: Pattern[] = [];
  
  // Only analyze user's moves for weaknesses
  // Filter out checkmate/resignation positions (eval > 5000cp swing)
  const userMoves = features.filter(f => 
    f.move_side === 'user' && 
    Math.abs(f.eval_swing_cp) < 5000  // Exclude checkmates/resignations
  );
  console.log(`  Analyzing ${userMoves.length} user moves (excluded ${features.filter(f => f.move_side === 'user').length - userMoves.length} checkmate positions)\n`);
  
  // === STRATEGY 1: Simple Feature Correlations ===
  console.log('📊 Strategy 1: Finding feature correlations...');
  const correlationPatterns = findFeatureCorrelations(userMoves, {
    minFrequency,
    minImpact,
    minCorrelation
  });
  patterns.push(...correlationPatterns);
  console.log(`  Found ${correlationPatterns.length} correlation patterns\n`);
  
  // === STRATEGY 2: Conditional Patterns (by context) ===
  console.log('🎯 Strategy 2: Finding conditional patterns...');
  const conditionalPatterns = findConditionalPatterns(userMoves, {
    minFrequency: Math.max(5, Math.floor(minFrequency / 2)), // Lower threshold for conditional
    minImpact,
    minCorrelation
  });
  patterns.push(...conditionalPatterns);
  console.log(`  Found ${conditionalPatterns.length} conditional patterns\n`);
  
  // === STRATEGY 3: Opening-Specific Patterns ===
  console.log('♟️  Strategy 3: Finding opening-specific patterns...');
  const openingPatterns = findOpeningPatterns(userMoves, {
    minGames: 3,
    minImpact
  });
  patterns.push(...openingPatterns);
  console.log(`  Found ${openingPatterns.length} opening patterns\n`);
  
  // Sort by priority and return top N
  const sortedPatterns = patterns
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxPatterns);
  
  console.log(`✅ Total patterns discovered: ${sortedPatterns.length}`);
  
  return sortedPatterns;
}

/**
 * Find correlations between features and eval loss
 */
function findFeatureCorrelations(
  positions: PositionFeatures[],
  options: { minFrequency: number; minImpact: number; minCorrelation: number }
): Pattern[] {
  const patterns: Pattern[] = [];
  
  // Features to analyze (numeric and boolean)
  const featuresToAnalyze = [
    // Pawn structure
    { key: 'doubled_pawns_user', name: 'Doubled Pawns', category: 'pawn_structure' },
    { key: 'isolated_pawns_user', name: 'Isolated Pawns', category: 'pawn_structure' },
    { key: 'backward_pawns_user', name: 'Backward Pawns', category: 'pawn_structure' },
    { key: 'pawn_islands_user', name: 'Pawn Islands', category: 'pawn_structure' },
    
    // King safety
    { key: 'king_pawn_shield_user', name: 'King Pawn Shield', category: 'king_safety', inverse: true },
    { key: 'king_in_center_user', name: 'King in Center', category: 'king_safety' },
    { key: 'king_open_files_user', name: 'Open Files Near King', category: 'king_safety' },
    
    // Piece activity
    { key: 'piece_mobility_user', name: 'Piece Mobility', category: 'piece_activity', inverse: true },
    { key: 'bishop_pair_user', name: 'Bishop Pair', category: 'piece_activity', inverse: true },
    { key: 'rook_on_seventh_user', name: 'Rook on Seventh', category: 'piece_activity', inverse: true },
    
    // Positional
    { key: 'center_control_user', name: 'Center Control', category: 'positional', inverse: true },
    { key: 'development_score_user', name: 'Development', category: 'positional', inverse: true },
    { key: 'space_advantage', name: 'Space Advantage', category: 'positional', inverse: true },
    
    // Tactical
    { key: 'hanging_pieces_user', name: 'Hanging Pieces', category: 'tactical' },
    { key: 'pieces_under_attack_user', name: 'Pieces Under Attack', category: 'tactical' },
  ];
  
  for (const feature of featuresToAnalyze) {
    const correlation = analyzeFeatureCorrelation(positions, feature.key, feature.inverse);
    
    if (!correlation) continue;
    
    // Check thresholds
    if (correlation.frequency < options.minFrequency) continue;
    if (Math.abs(correlation.avgImpact) < options.minImpact) continue;
    if (Math.abs(correlation.coefficient) < options.minCorrelation) continue;
    
    // Get all unique game IDs for this pattern
    const relevantPositions = positions.filter(p => {
      const value = (p as any)[feature.key];
      return typeof value === 'boolean' ? value : value > 0;
    });
    const uniqueGameIds = Array.from(new Set(relevantPositions.map(p => p.gameId)));
    
    // Determine pattern type - validate against actual examples
    // Get examples first to validate the pattern direction
    const examples = findTopExamples(positions, feature.key, 5);
    
    // If we can't find good examples, skip this pattern
    if (examples.length === 0) continue;
    
    // Validate: examples should match the claimed pattern type
    const avgExampleSwing = examples.reduce((sum, ex) => sum + ex.evalSwing, 0) / examples.length;
    const isWeakness = avgExampleSwing < 0;  // Based on actual examples, not just correlation
    const type = isWeakness ? 'weakness' : 'strength';
    
    // Additional validation: if correlation and examples disagree strongly, skip it
    const correlationSaysWeakness = correlation.avgImpact < 0;
    if (isWeakness !== correlationSaysWeakness && Math.abs(correlation.coefficient) < 0.5) {
      // Weak correlation with contradictory examples = noise, skip it
      continue;
    }
    
    patterns.push({
      id: `corr_${feature.key}`,
      type,
      name: feature.name,
      description: generateDescription(feature.name, correlation.avgImpact, feature.category),
      frequency: correlation.frequency,
      impact: Math.round(correlation.avgImpact),
      confidence: Math.abs(correlation.coefficient),
      correlation: correlation.coefficient,
      pValue: correlation.pValue,
      conditions: {},
      examples: examples,  // Already calculated above for validation
      gameIds: uniqueGameIds,
      priority: calculatePriority(correlation.frequency, Math.abs(correlation.avgImpact)),
      recommendation: generateRecommendation(feature.name, feature.category, isWeakness)
    });
  }
  
  return patterns;
}

/**
 * Find patterns that only appear under specific conditions
 */
function findConditionalPatterns(
  positions: PositionFeatures[],
  options: { minFrequency: number; minImpact: number; minCorrelation: number }
): Pattern[] {
  const patterns: Pattern[] = [];
  
  // Define conditions to test
  const conditions = [
    { key: 'game_phase', values: ['opening', 'middlegame', 'endgame'], name: 'Game Phase' },
    { key: 'time_control', values: ['bullet', 'blitz', 'rapid'], name: 'Time Control' },
  ];
  
  // Features to test conditionally
  const features = [
    { key: 'doubled_pawns_user', name: 'Doubled Pawns' },
    { key: 'isolated_pawns_user', name: 'Isolated Pawns' },
    { key: 'king_in_center_user', name: 'King in Center' },
    { key: 'hanging_pieces_user', name: 'Hanging Pieces' },
  ];
  
  for (const condition of conditions) {
    for (const value of condition.values) {
      // Filter positions for this condition
      const filtered = positions.filter(p => (p as any)[condition.key] === value);
      
      if (filtered.length < options.minFrequency * 2) continue; // Need more data
      
      for (const feature of features) {
        const correlation = analyzeFeatureCorrelation(filtered, feature.key, false);
        
        if (!correlation) continue;
        if (correlation.frequency < options.minFrequency) continue;
        if (Math.abs(correlation.avgImpact) < options.minImpact) continue;
        if (Math.abs(correlation.coefficient) < options.minCorrelation) continue;
        
        const isWeakness = correlation.avgImpact < 0;
        
        // Get all unique game IDs for this conditional pattern
        const relevantFiltered = filtered.filter(p => {
          const val = (p as any)[feature.key];
          return typeof val === 'boolean' ? val : val > 0;
        });
        const uniqueGameIds = Array.from(new Set(relevantFiltered.map(p => p.gameId)));
        
        patterns.push({
          id: `cond_${feature.key}_${condition.key}_${value}`,
          type: 'situational',
          name: `${feature.name} in ${value}`,
          description: `${feature.name} specifically during ${value} phase correlates with ${isWeakness ? 'worse' : 'better'} positions`,
          frequency: correlation.frequency,
          impact: Math.round(correlation.avgImpact),
          confidence: Math.abs(correlation.coefficient),
          correlation: correlation.coefficient,
          pValue: correlation.pValue,
          conditions: { [condition.key]: value },
          examples: findTopExamples(filtered, feature.key, 3),
          gameIds: uniqueGameIds,
          priority: calculatePriority(correlation.frequency, Math.abs(correlation.avgImpact)),
          recommendation: `Focus on ${feature.name.toLowerCase()} specifically in ${value} games`
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Find patterns specific to openings
 */
function findOpeningPatterns(
  positions: PositionFeatures[],
  options: { minGames: number; minImpact: number }
): Pattern[] {
  const patterns: Pattern[] = [];
  
  // Group by opening ECO
  const byOpening = new Map<string, PositionFeatures[]>();
  for (const pos of positions) {
    if (!pos.opening_eco) continue;
    const eco = pos.opening_eco;
    if (!byOpening.has(eco)) byOpening.set(eco, []);
    byOpening.get(eco)!.push(pos);
  }
  
  for (const [eco, openingPositions] of byOpening.entries()) {
    // Need minimum number of games
    const gameIds = new Set(openingPositions.map(p => p.gameId));
    if (gameIds.size < options.minGames) continue;
    
    // Calculate average eval loss in this opening (exclude checkmates)
    const nonCheckmatePositions = openingPositions.filter(p => Math.abs(p.eval_swing_cp) < 5000);
    if (nonCheckmatePositions.length === 0) continue;
    
    const avgEvalLoss = nonCheckmatePositions.reduce((sum, p) => sum + p.eval_swing_cp, 0) / nonCheckmatePositions.length;
    
    if (Math.abs(avgEvalLoss) < options.minImpact) continue;
    
    // Find the phase where most mistakes happen
    const byPhase = {
      opening: openingPositions.filter(p => p.game_phase === 'opening'),
      middlegame: openingPositions.filter(p => p.game_phase === 'middlegame'),
      endgame: openingPositions.filter(p => p.game_phase === 'endgame'),
    };
    
    const worstPhase = Object.entries(byPhase)
      .map(([phase, poss]) => ({
        phase,
        avgLoss: poss.length > 0 ? poss.reduce((sum, p) => sum + p.eval_swing_cp, 0) / poss.length : 0,
        count: poss.length
      }))
      .filter(p => p.count > 0)
      .sort((a, b) => a.avgLoss - b.avgLoss)[0];
    
    if (!worstPhase) continue;
    
    // Find common mistakes (exclude checkmates)
    const mistakes = openingPositions.filter(p => 
      (p.was_mistake || p.was_blunder) && 
      Math.abs(p.eval_swing_cp) < 5000
    );
    const avgMoveNo = mistakes.length > 0 
      ? Math.round(mistakes.reduce((sum, p) => sum + p.moveNo, 0) / mistakes.length)
      : 0;
    
    const openingName = openingPositions[0].opening_name || eco;
    
    // Validate the pattern type against actual examples
    const nonCheckmateErrors = mistakes.slice(0, 5);
    const avgExampleSwing = nonCheckmateErrors.length > 0
      ? nonCheckmateErrors.reduce((sum, p) => sum + p.eval_swing_cp, 0) / nonCheckmateErrors.length
      : avgEvalLoss;
    
    // Pattern is weakness if examples show losses, regardless of overall average
    const isWeakness = avgExampleSwing < 0 || avgEvalLoss < 0;
    
    patterns.push({
      id: `opening_${eco}`,
      type: isWeakness ? 'weakness' : 'strength',
      name: `${openingName} (${eco})`,
      description: `In ${openingName}, you ${isWeakness ? 'struggle' : 'perform well'}, especially in the ${worstPhase.phase} around move ${avgMoveNo}`,
      frequency: openingPositions.length,
      impact: Math.round(avgEvalLoss),
      confidence: Math.min(1, gameIds.size / 10), // Confidence based on sample size
      correlation: 0, // Not a correlation pattern
      pValue: 0.05, // Assume significant if we have enough games
      conditions: { opening_eco: eco, game_phase: worstPhase.phase },
      examples: mistakes.slice(0, 3).map(p => ({
        gameId: p.gameId,
        moveNo: p.moveNo,
        fen: p.fen,
        evalSwing: p.eval_swing_cp,
        context: `Move ${p.moveNo} (${p.game_phase})`
      })),
      gameIds: Array.from(gameIds), // All games with this opening
      priority: calculatePriority(gameIds.size * 5, Math.abs(avgEvalLoss)), // Weight games more
      recommendation: `Study typical plans in ${openingName}, especially ${worstPhase.phase} positions around move ${avgMoveNo}`
    });
  }
  
  return patterns;
}

// ===== STATISTICAL HELPERS =====

function analyzeFeatureCorrelation(
  positions: PositionFeatures[],
  featureKey: string,
  inverse: boolean = false
): CorrelationResult | null {
  // Filter positions where feature is present/relevant
  const relevant = positions.filter(p => {
    const value = (p as any)[featureKey];
    return typeof value === 'boolean' ? value : value > 0;
  });
  
  if (relevant.length === 0) return null;
  
  // Extract feature values and eval swings
  const featureValues = relevant.map(p => {
    const value = (p as any)[featureKey];
    return typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
  });
  
  const evalSwings = relevant.map(p => p.eval_swing_cp);
  
  // Calculate Pearson correlation
  let coefficient = pearsonCorrelation(featureValues, evalSwings);
  
  // Inverse features (e.g., mobility is good) should flip correlation
  if (inverse) coefficient = -coefficient;
  
  // Calculate p-value (simplified)
  const pValue = calculatePValue(coefficient, relevant.length);
  
  // Average impact when feature is present
  const avgImpact = evalSwings.reduce((sum, val) => sum + val, 0) / evalSwings.length;
  
  return {
    feature: featureKey,
    coefficient,
    pValue,
    avgImpact,
    frequency: relevant.length
  };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  
  const sum_x = x.reduce((a, b) => a + b, 0);
  const sum_y = y.reduce((a, b) => a + b, 0);
  const sum_xy = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sum_x2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sum_y2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sum_xy - sum_x * sum_y;
  const denominator = Math.sqrt((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

function calculatePValue(correlation: number, sampleSize: number): number {
  // Simplified p-value calculation using t-distribution approximation
  // For proper implementation, would use t-distribution tables
  const t = Math.abs(correlation) * Math.sqrt((sampleSize - 2) / (1 - correlation * correlation));
  
  // Very rough approximation
  if (t > 2.576) return 0.01; // 99% confidence
  if (t > 1.96) return 0.05; // 95% confidence
  if (t > 1.645) return 0.10; // 90% confidence
  return 0.20; // Not significant
}

function calculatePriority(frequency: number, impact: number): number {
  // Priority = (frequency/10) * (impact/100), normalized to 1-10
  const raw = (frequency / 10) * (impact / 100);
  return Math.min(10, Math.max(1, Math.round(raw)));
}

function findTopExamples(
  positions: PositionFeatures[],
  featureKey: string,
  count: number
): Pattern['examples'] {
  // Filter positions where feature is present
  const withFeature = positions.filter(p => {
    const value = (p as any)[featureKey];
    return typeof value === 'boolean' ? value : value > 0;
  });
  
  // Sort by eval swing (worst first)
  // Exclude checkmates and only show tactical mistakes
  const sorted = withFeature
    .filter(p => p.eval_swing_cp < 0 && p.eval_swing_cp > -5000) // Exclude checkmates
    .sort((a, b) => a.eval_swing_cp - b.eval_swing_cp)
    .slice(0, count);
  
  return sorted.map(p => ({
    gameId: p.gameId,
    moveNo: p.moveNo,
    fen: p.fen,
    evalSwing: p.eval_swing_cp,
    context: `${p.game_phase} (${p.time_control})`
  }));
}

function generateDescription(featureName: string, impact: number, category: string): string {
  const isPositive = impact > 0;
  const direction = isPositive ? 'correlates with better positions' : 'correlates with worse positions';
  
  const categoryText = {
    pawn_structure: 'This is a pawn structure issue',
    king_safety: 'This affects king safety',
    piece_activity: 'This relates to piece activity',
    positional: 'This is a positional factor',
    tactical: 'This is a tactical issue'
  }[category] || '';
  
  return `${featureName} ${direction}. ${categoryText}.`;
}

function generateRecommendation(featureName: string, category: string, isWeakness: boolean): string {
  if (!isWeakness) {
    return `Continue leveraging ${featureName.toLowerCase()} - it's working well for you`;
  }
  
  const recommendations: Record<string, string> = {
    'Doubled Pawns': 'Study pawn structure fundamentals and avoid unnecessary pawn trades that double your pawns',
    'Isolated Pawns': 'Learn how to avoid creating isolated pawns, especially in the opening',
    'Backward Pawns': 'Practice identifying and preventing backward pawns before they become weak',
    'King in Center': 'Prioritize king safety - castle early and keep your king protected',
    'Hanging Pieces': 'Before each move, ask: "Are all my pieces defended?" This alone will dramatically improve your play',
    'Pieces Under Attack': 'Develop the habit of checking which pieces are under attack before moving',
    'Piece Mobility': 'Work on piece activity - aim for pieces that have many squares to move to',
    'Center Control': 'Study center control principles - fight for e4/e5/d4/d5 squares',
    'Development': 'Focus on developing all pieces quickly in the opening before attacking',
  };
  
  return recommendations[featureName] || `Study ${category.replace('_', ' ')} to improve your ${featureName.toLowerCase()}`;
}

