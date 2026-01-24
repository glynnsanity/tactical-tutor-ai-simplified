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

// Track if Stockfish is available
let stockfishAvailable: boolean | null = null;

/**
 * Check if Stockfish binary exists
 */
async function checkStockfishAvailable(): Promise<boolean> {
  if (stockfishAvailable !== null) {
    return stockfishAvailable;
  }

  const stockfishPath = process.env.STOCKFISH_PATH || 'stockfish';

  return new Promise((resolve) => {
    try {
      const testProcess = spawn(stockfishPath, [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const timeout = setTimeout(() => {
        testProcess.kill();
        stockfishAvailable = false;
        resolve(false);
      }, 3000);

      testProcess.on('error', () => {
        clearTimeout(timeout);
        stockfishAvailable = false;
        console.log('[Stockfish] Binary not found - Stockfish analysis disabled');
        resolve(false);
      });

      testProcess.stdout?.once('data', () => {
        clearTimeout(timeout);
        testProcess.stdin?.write('quit\n');
        testProcess.kill();
        stockfishAvailable = true;
        console.log('[Stockfish] Binary found - Stockfish analysis enabled');
        resolve(true);
      });

      testProcess.stdin?.write('uci\n');
    } catch {
      stockfishAvailable = false;
      resolve(false);
    }
  });
}

/**
 * Stockfish Engine Pool
 * Manages multiple Stockfish instances for parallel analysis
 */
class StockfishPool {
  private engines: ChildProcess[] = [];
  private available: ChildProcess[] = [];
  private readonly poolSize: number;
  private initialized: boolean = false;
  private initFailed: boolean = false;

  constructor(poolSize: number = 2) {
    this.poolSize = poolSize;
  }

  async initialize(): Promise<void> {
    // Check if Stockfish is available first
    const isAvailable = await checkStockfishAvailable();
    if (!isAvailable) {
      this.initFailed = true;
      console.log('[StockfishPool] Stockfish not available, pool disabled');
      return;
    }

    try {
      for (let i = 0; i < this.poolSize; i++) {
        const engine = await this.createEngine();
        if (engine) {
          this.engines.push(engine);
          this.available.push(engine);
        }
      }
      this.initialized = this.engines.length > 0;
      if (!this.initialized) {
        this.initFailed = true;
      }
    } catch (err) {
      console.error('[StockfishPool] Failed to initialize:', err);
      this.initFailed = true;
    }
  }

  isAvailable(): boolean {
    return this.initialized && !this.initFailed && this.engines.length > 0;
  }

  private async createEngine(): Promise<ChildProcess | null> {
    // Use system-installed Stockfish binary
    // On macOS with Homebrew: /opt/homebrew/bin/stockfish
    // On Linux: usually /usr/bin/stockfish or /usr/games/stockfish
    const stockfishPath = process.env.STOCKFISH_PATH || 'stockfish';

    return new Promise((resolve) => {
      try {
        const engine = spawn(stockfishPath, [], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Handle spawn errors
        engine.on('error', (err) => {
          console.error('[Stockfish] Engine spawn error:', err.message);
          resolve(null);
        });

        const timeout = setTimeout(() => {
          engine.kill();
          resolve(null);
        }, 5000);

        const onData = (data: Buffer) => {
          if (data.toString().includes('uciok')) {
            clearTimeout(timeout);
            engine.stdout?.removeListener('data', onData);
            resolve(engine);
          }
        };

        engine.stdout?.on('data', onData);
        engine.stdin?.write('uci\n');
      } catch (err) {
        console.error('[Stockfish] Failed to spawn engine:', err);
        resolve(null);
      }
    });
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
let poolInitPromise: Promise<StockfishPool> | null = null;

async function getEnginePool(): Promise<StockfishPool> {
  if (!enginePool) {
    if (!poolInitPromise) {
      poolInitPromise = (async () => {
        // 32 engines to support heavy parallel game processing
        // Each game can request 40+ concurrent analyses, so we need a large pool
        // Can be tuned via STOCKFISH_POOL_SIZE env var
        const poolSize = parseInt(process.env.STOCKFISH_POOL_SIZE || '32', 10);
        const pool = new StockfishPool(poolSize);
        await pool.initialize();
        console.log(`[StockfishPool] Initialized with ${poolSize} engines`);
        enginePool = pool;
        return pool;
      })();
    }
    return poolInitPromise;
  }
  return enginePool;
}

/**
 * Check if Stockfish analysis is available
 */
export async function isStockfishAvailable(): Promise<boolean> {
  const pool = await getEnginePool();
  return pool.isAvailable();
}

/**
 * Analyze a position with Stockfish
 * Throws an error if Stockfish is not available
 */
export async function analyzeWithStockfish(
  fen: string,
  depth: number = 15
): Promise<Evaluation> {
  const pool = await getEnginePool();

  if (!pool.isAvailable()) {
    throw new Error('Stockfish is not available');
  }

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

