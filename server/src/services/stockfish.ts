/**
 * Stockfish Chess Engine Service
 * Analyzes positions locally using Stockfish
 */

import { spawn, ChildProcess } from 'child_process';

interface Evaluation {
  fen: string;
  eval: number;       // Centipawn score (positive = white advantage)
  mate?: number;      // Mate in X moves (positive = white mates)
  depth: number;
  bestMove?: string;
  source: 'lichess' | 'stockfish';
}

interface EngineOutput {
  depth: number;
  score: number;
  mate?: number;
  bestMove?: string;
}

/**
 * Stockfish Engine Pool
 * Manages multiple Stockfish instances for parallel analysis
 */
class StockfishPool {
  private engines: ChildProcess[] = [];
  private available: ChildProcess[] = [];
  private readonly poolSize: number;

  constructor(poolSize: number = 2) {
    this.poolSize = poolSize;
  }

  async initialize(): Promise<void> {
    for (let i = 0; i < this.poolSize; i++) {
      const engine = await this.createEngine();
      this.engines.push(engine);
      this.available.push(engine);
    }
  }

  private async createEngine(): Promise<ChildProcess> {
    // Use system-installed Stockfish binary
    // On macOS with Homebrew: /opt/homebrew/bin/stockfish
    // On Linux: usually /usr/bin/stockfish or /usr/games/stockfish
    const stockfishPath = process.env.STOCKFISH_PATH || 'stockfish';
    
    const engine = spawn(stockfishPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Wait for engine to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stockfish initialization timeout'));
      }, 5000);

      const onData = (data: Buffer) => {
        if (data.toString().includes('uciok')) {
          clearTimeout(timeout);
          engine.stdout?.removeListener('data', onData);
          resolve();
        }
      };
      
      engine.stdout?.on('data', onData);
      engine.stdin?.write('uci\n');
    });

    return engine;
  }

  async acquire(): Promise<ChildProcess> {
    while (this.available.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.available.pop()!;
  }

  release(engine: ChildProcess): void {
    this.available.push(engine);
  }

  async shutdown(): Promise<void> {
    for (const engine of this.engines) {
      engine.stdin?.write('quit\n');
      engine.kill();
    }
    this.engines = [];
    this.available = [];
  }
}

// Global engine pool (lazy initialized)
let enginePool: StockfishPool | null = null;

async function getEnginePool(): Promise<StockfishPool> {
  if (!enginePool) {
    enginePool = new StockfishPool(8); // 8 engines for parallel analysis
    await enginePool.initialize();
  }
  return enginePool;
}

/**
 * Analyze a position with Stockfish
 */
export async function analyzeWithStockfish(
  fen: string,
  depth: number = 15
): Promise<Evaluation> {
  const pool = await getEnginePool();
  const engine = await pool.acquire();

  try {
    const result = await analyzePosition(engine, fen, depth);
    
    return {
      fen,
      eval: result.mate ? result.mate * 10000 : result.score,
      mate: result.mate,
      depth: result.depth,
      bestMove: result.bestMove,
      source: 'stockfish'
    };
  } finally {
    pool.release(engine);
  }
}

/**
 * Analyze a single position with a Stockfish engine instance
 */
function analyzePosition(
  engine: ChildProcess,
  fen: string,
  depth: number
): Promise<EngineOutput> {
  return new Promise((resolve, reject) => {
    let bestMove: string | undefined;
    let score: number = 0;
    let mate: number | undefined;
    let currentDepth: number = 0;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Stockfish analysis timeout'));
    }, 20000); // 20 second timeout - fail fast on complex positions

    const onData = (data: Buffer) => {
      const lines = data.toString().split('\n');
      
      for (const line of lines) {
        // Parse depth
        const depthMatch = line.match(/depth (\d+)/);
        if (depthMatch) {
          currentDepth = parseInt(depthMatch[1]);
        }

        // Parse score
        const cpMatch = line.match(/score cp (-?\d+)/);
        if (cpMatch) {
          score = parseInt(cpMatch[1]);
          mate = undefined;
        }

        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) {
          mate = parseInt(mateMatch[1]);
          score = mate * 10000; // Convert to large number
        }

        // Parse best move
        const bestMoveMatch = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (bestMoveMatch) {
          bestMove = bestMoveMatch[1];
          cleanup();
          resolve({
            depth: currentDepth,
            score,
            mate,
            bestMove
          });
        }
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      engine.stdout?.removeListener('data', onData);
      engine.stderr?.removeListener('data', onError);
    };

    engine.stdout?.on('data', onData);
    engine.stderr?.on('data', onError);

    // Send commands to engine
    engine.stdin?.write(`position fen ${fen}\n`);
    engine.stdin?.write(`go depth ${depth}\n`);
  });
}

/**
 * Shutdown all Stockfish engines (call on server shutdown)
 */
export async function shutdownStockfish(): Promise<void> {
  if (enginePool) {
    await enginePool.shutdown();
    enginePool = null;
  }
}

/**
 * Test if Stockfish is working
 */
export async function testStockfish(): Promise<boolean> {
  try {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = await analyzeWithStockfish(fen, 10);
    return result.depth >= 10;
  } catch {
    return false;
  }
}

