/**
 * Hybrid Position Analyzer
 * Tries Lichess Cloud API first, falls back to local Stockfish
 */

import { fetchLichessEval } from './lichess';
import { analyzeWithStockfish } from './stockfish';

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
    skipLichess = false
  } = options;

  stats.total++;

  // Step 1: Try Lichess API (unless explicitly skipped)
  if (!skipLichess) {
    try {
      const lichessResult = await fetchLichessEval(fen, minDepth);
      
      if (lichessResult) {
        stats.lichessHits++;
        console.log(`[Hybrid] ✅ Lichess hit (depth ${lichessResult.depth})`);
        return lichessResult;
      }
    } catch (error) {
      // Silently continue to Stockfish fallback
      console.log(`[Hybrid] ⚠️ Lichess failed, using Stockfish`);
    }
  }

  // Step 2: Fallback to local Stockfish
  try {
    stats.stockfishFallbacks++;
    console.log(`[Hybrid] 🔧 Analyzing with Stockfish (depth ${stockfishDepth})`);
    const stockfishResult = await analyzeWithStockfish(fen, stockfishDepth);
    return stockfishResult;
  } catch (error) {
    stats.errors++;
    console.error(`[Hybrid] ❌ Stockfish failed:`, error);
    
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
[Hybrid Analysis Stats]
  Total positions: ${stats.total}
  Lichess hits: ${stats.lichessHits} (${hitRate}%)
  Stockfish fallbacks: ${stats.stockfishFallbacks}
  Errors: ${stats.errors}
  `);
}

