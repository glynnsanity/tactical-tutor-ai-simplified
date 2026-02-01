/**
 * Position Analyzer
 *
 * Uses local Stockfish for fast parallel analysis.
 * Lichess Cloud API available as optional fallback but disabled by default
 * due to rate limiting bottleneck (10 req/sec makes bulk analysis slow).
 *
 * Benchmark results: Pure Stockfish ×8 is ~10x faster than Lichess hybrid.
 */

import { fetchLichessEval } from './lichess';
import { analyzeWithStockfish, isStockfishAvailable } from './stockfish';

// Cache Stockfish availability check
let stockfishAvailabilityChecked = false;
let stockfishIsAvailable = false;

export interface Evaluation {
  fen: string;
  eval: number;       // Centipawn score (positive = white advantage)
  mate?: number;      // Mate in X moves (positive = white mates)
  depth: number;
  bestMove?: string;
  source: 'lichess' | 'stockfish';
}

interface AnalysisStats {
  total: number;
  lichessHits: number;
  stockfishFallbacks: number;
  errors: number;
}

// Track statistics for monitoring
const stats: AnalysisStats = {
  total: 0,
  lichessHits: 0,
  stockfishFallbacks: 0,
  errors: 0
};

/**
 * Analyze a position using hybrid approach:
 * 1. Try Lichess Cloud API (fast, high depth)
 * 2. Fallback to local Stockfish if needed (reliable, depth 12)
 */
export async function analyzePosition(
  fen: string,
  options: {
    minDepth?: number;
    stockfishDepth?: number;
    skipLichess?: boolean;
  } = {}
): Promise<Evaluation> {
  const {
    minDepth = 18,
    stockfishDepth = 12, // Reduced from 15 for better performance
    skipLichess = true   // Skip Lichess by default - pure Stockfish is ~10x faster for bulk analysis
  } = options;

  stats.total++;

  // Step 1: Try Lichess API (only if explicitly enabled)
  if (!skipLichess) {
    try {
      const lichessResult = await fetchLichessEval(fen, minDepth);

      if (lichessResult) {
        stats.lichessHits++;
        return lichessResult;
      }
    } catch (error) {
      // Silently continue to Stockfish fallback
    }
  }

  // Step 2: Use local Stockfish (check availability once and cache)
  if (!stockfishAvailabilityChecked) {
    stockfishIsAvailable = await isStockfishAvailable();
    stockfishAvailabilityChecked = true;
    if (stockfishIsAvailable) {
      console.log('[Analysis] Stockfish pool initialized (8 engines)');
    } else {
      console.log('[Analysis] Stockfish not available - analysis disabled');
    }
  }

  if (!stockfishIsAvailable) {
    // Return a fallback evaluation without logging (reduce noise)
    return {
      fen,
      eval: 0,
      depth: 0,
      source: 'stockfish'
    };
  }

  try {
    stats.stockfishFallbacks++;
    const stockfishResult = await analyzeWithStockfish(fen, stockfishDepth);
    return stockfishResult;
  } catch (error) {
    stats.errors++;
    console.error(`[Analysis] Stockfish failed:`, error);

    // Return a fallback evaluation (no analysis)
    return {
      fen,
      eval: 0,
      depth: 0,
      source: 'stockfish'
    };
  }
}

/**
 * Analyze multiple positions in batch
 * Returns array of evaluations in same order as input
 */
export async function analyzePositions(
  fens: string[],
  options: {
    minDepth?: number;
    stockfishDepth?: number;
    skipLichess?: boolean;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<Evaluation[]> {
  const results: Evaluation[] = [];
  
  for (let i = 0; i < fens.length; i++) {
    const evaluation = await analyzePosition(fens[i], options);
    results.push(evaluation);
    
    if (options.onProgress) {
      options.onProgress(i + 1, fens.length);
    }
  }
  
  return results;
}

/**
 * Get analysis statistics (for monitoring)
 */
export function getAnalysisStats(): AnalysisStats {
  return { ...stats };
}

/**
 * Reset analysis statistics
 */
export function resetAnalysisStats(): void {
  stats.total = 0;
  stats.lichessHits = 0;
  stats.stockfishFallbacks = 0;
  stats.errors = 0;
}

/**
 * Get cache hit rate percentage
 */
export function getCacheHitRate(): number {
  if (stats.total === 0) return 0;
  return (stats.lichessHits / stats.total) * 100;
}

/**
 * Log analysis statistics
 */
export function logAnalysisStats(): void {
  const hitRate = getCacheHitRate().toFixed(1);
  console.log(`
[Position Analysis Stats]
  Total positions: ${stats.total}
  Lichess hits: ${stats.lichessHits} (${hitRate}%)
  Stockfish analyzed: ${stats.stockfishFallbacks}
  Errors: ${stats.errors}
  `);
}

