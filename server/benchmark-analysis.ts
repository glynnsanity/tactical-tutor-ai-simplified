/**
 * Benchmark: Hybrid (Lichess + Stockfish) vs Pure Stockfish Analysis
 *
 * Tests different analysis strategies to find the fastest approach
 * for bulk game analysis.
 *
 * Usage: npx tsx server/benchmark-analysis.ts
 */

import { Chess } from 'chess.js';
import { spawn, ChildProcess } from 'child_process';

// ============== Configuration ==============
const TEST_USERNAME = 'midnightcontender';
const NUM_GAMES_TO_TEST = process.env.NUM_GAMES ? parseInt(process.env.NUM_GAMES) : 5;
const STOCKFISH_DEPTH = 12;
const STOCKFISH_POOL_SIZES = [4, 8, 12];

// ============== Types ==============
interface Position {
  fen: string;
  moveNo: number;
}

interface BenchmarkResult {
  approach: string;
  totalPositions: number;
  totalTimeMs: number;
  avgTimePerPosition: number;
  avgTimePerGame: number;
  positionsPerSecond: number;
}

interface Evaluation {
  fen: string;
  eval: number;
  depth: number;
  source: 'lichess' | 'stockfish';
}

// ============== Lichess Rate Limiter ==============
class RateLimiter {
  private requestsInWindow = 0;
  private readonly maxRequestsPerSecond: number;
  private queue: Array<() => void> = [];

  constructor(maxRequestsPerSecond: number = 10) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    if (this.requestsInWindow >= this.maxRequestsPerSecond) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.requestsInWindow++;

    setTimeout(() => {
      this.requestsInWindow--;
      const next = this.queue.shift();
      if (next) next();
    }, 1000);

    return fn();
  }
}

const lichessLimiter = new RateLimiter(10);

// ============== Lichess API ==============
async function fetchLichessEval(fen: string): Promise<Evaluation | null> {
  try {
    const result = await lichessLimiter.throttle(async () => {
      const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TacticalTutorAI-Benchmark/1.0'
          }
        });

        clearTimeout(timeout);
        if (!response.ok) return null;

        const data = await response.json() as any;
        return data;
      } catch {
        clearTimeout(timeout);
        return null;
      }
    });

    if (!result || result.depth < 18) return null;

    const pv = result.pvs?.[0];
    if (!pv) return null;

    return {
      fen,
      eval: pv.cp ?? (pv.mate ? pv.mate * 10000 : 0),
      depth: result.depth,
      source: 'lichess'
    };
  } catch {
    return null;
  }
}

// ============== Stockfish Pool ==============
class StockfishPool {
  private engines: ChildProcess[] = [];
  private available: ChildProcess[] = [];
  private readonly poolSize: number;
  private initialized = false;

  constructor(poolSize: number) {
    this.poolSize = poolSize;
  }

  async initialize(): Promise<boolean> {
    const stockfishPath = process.env.STOCKFISH_PATH || 'stockfish';

    for (let i = 0; i < this.poolSize; i++) {
      const engine = await this.createEngine(stockfishPath);
      if (engine) {
        this.engines.push(engine);
        this.available.push(engine);
      }
    }

    this.initialized = this.engines.length > 0;
    return this.initialized;
  }

  private createEngine(stockfishPath: string): Promise<ChildProcess | null> {
    return new Promise((resolve) => {
      try {
        const engine = spawn(stockfishPath, [], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        engine.on('error', () => resolve(null));

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
      } catch {
        resolve(null);
      }
    });
  }

  async acquire(): Promise<ChildProcess> {
    while (this.available.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 50));
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

  get size(): number {
    return this.engines.length;
  }
}

// ============== Stockfish Analysis ==============
function analyzeWithEngine(engine: ChildProcess, fen: string, depth: number): Promise<Evaluation> {
  return new Promise((resolve, reject) => {
    let score = 0;
    let currentDepth = 0;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Stockfish timeout'));
    }, 15000);

    const onData = (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const depthMatch = line.match(/depth (\d+)/);
        if (depthMatch) currentDepth = parseInt(depthMatch[1]);

        const cpMatch = line.match(/score cp (-?\d+)/);
        if (cpMatch) score = parseInt(cpMatch[1]);

        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) score = parseInt(mateMatch[1]) * 10000;

        if (line.includes('bestmove')) {
          cleanup();
          resolve({ fen, eval: score, depth: currentDepth, source: 'stockfish' });
        }
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      engine.stdout?.removeListener('data', onData);
    };

    engine.stdout?.on('data', onData);
    engine.stdin?.write(`position fen ${fen}\n`);
    engine.stdin?.write(`go depth ${depth}\n`);
  });
}

// ============== Chess.com API ==============
async function fetchRecentGames(username: string, limit: number): Promise<string[]> {
  console.log(`\nFetching games for ${username}...`);

  const archivesUrl = `https://api.chess.com/pub/player/${username}/games/archives`;
  const archivesRes = await fetch(archivesUrl);
  if (!archivesRes.ok) throw new Error(`Failed to fetch archives: ${archivesRes.status}`);

  const archivesData = await archivesRes.json() as { archives?: string[] };
  const archives = archivesData.archives?.slice().reverse() || [];

  if (archives.length === 0) throw new Error('No archives found');

  // Fetch most recent archive
  const pgnUrl = `${archives[0]}/pgn`;
  const pgnRes = await fetch(pgnUrl);
  if (!pgnRes.ok) throw new Error(`Failed to fetch PGN: ${pgnRes.status}`);

  const pgnText = await pgnRes.text();
  const games = pgnText.split('\n\n[Event').map((g, i) => i === 0 ? g : '[Event' + g);

  // Filter for standard games only
  const standardGames = games.filter(g => !g.includes('[Variant') || g.includes('Standard'));

  console.log(`Found ${standardGames.length} standard games, using ${Math.min(limit, standardGames.length)}`);
  return standardGames.slice(0, limit);
}

// ============== Position Extraction ==============
function extractPositions(pgn: string): Position[] {
  const positions: Position[] = [];
  const chess = new Chess();

  try {
    chess.loadPgn(pgn, { sloppy: true });
    const history = chess.history({ verbose: true });

    chess.reset();
    for (const mv of history) {
      const fenBefore = chess.fen();
      chess.move(mv);
      const fenAfter = chess.fen();
      const moveNo = chess.turn() === 'w' ? chess.moveNumber() - 1 : chess.moveNumber();

      // Add both before and after positions (matching current implementation)
      positions.push({ fen: fenBefore, moveNo });
      positions.push({ fen: fenAfter, moveNo });
    }
  } catch (e) {
    // Skip malformed games
  }

  return positions;
}

// ============== Benchmark: Hybrid Approach ==============
async function benchmarkHybrid(positions: Position[], stockfishPool: StockfishPool): Promise<{ timeMs: number; lichessHits: number; stockfishFallbacks: number }> {
  let lichessHits = 0;
  let stockfishFallbacks = 0;

  const start = Date.now();

  // Process in batches of 20 (matching current implementation)
  const batchSize = 20;
  for (let i = 0; i < positions.length; i += batchSize) {
    const batch = positions.slice(i, i + batchSize);

    await Promise.all(batch.map(async (pos) => {
      // Try Lichess first
      const lichessResult = await fetchLichessEval(pos.fen);
      if (lichessResult) {
        lichessHits++;
        return lichessResult;
      }

      // Fallback to Stockfish
      stockfishFallbacks++;
      const engine = await stockfishPool.acquire();
      try {
        return await analyzeWithEngine(engine, pos.fen, STOCKFISH_DEPTH);
      } finally {
        stockfishPool.release(engine);
      }
    }));
  }

  return {
    timeMs: Date.now() - start,
    lichessHits,
    stockfishFallbacks
  };
}

// ============== Benchmark: Pure Stockfish ==============
async function benchmarkPureStockfish(positions: Position[], poolSize: number): Promise<number> {
  const pool = new StockfishPool(poolSize);
  const initialized = await pool.initialize();

  if (!initialized) {
    throw new Error('Failed to initialize Stockfish pool');
  }

  console.log(`  Initialized ${pool.size} Stockfish engines`);

  const start = Date.now();

  // Process all positions in parallel (limited by pool size)
  await Promise.all(positions.map(async (pos) => {
    const engine = await pool.acquire();
    try {
      return await analyzeWithEngine(engine, pos.fen, STOCKFISH_DEPTH);
    } finally {
      pool.release(engine);
    }
  }));

  const elapsed = Date.now() - start;
  await pool.shutdown();

  return elapsed;
}

// ============== Main Benchmark ==============
async function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Analysis Benchmark: Hybrid vs Pure Stockfish            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Fetch games
  const games = await fetchRecentGames(TEST_USERNAME, NUM_GAMES_TO_TEST);

  // Extract all positions
  let allPositions: Position[] = [];
  const positionsPerGame: number[] = [];

  for (const pgn of games) {
    const positions = extractPositions(pgn);
    positionsPerGame.push(positions.length);
    allPositions = allPositions.concat(positions);
  }

  const avgPositionsPerGame = Math.round(allPositions.length / games.length);

  console.log(`\n📊 Test Data:`);
  console.log(`   Games: ${games.length}`);
  console.log(`   Total positions: ${allPositions.length}`);
  console.log(`   Avg positions/game: ${avgPositionsPerGame}`);
  console.log(`   Positions per game: ${positionsPerGame.join(', ')}`);

  const results: BenchmarkResult[] = [];

  // ============== Test 1: Current Hybrid Approach ==============
  console.log(`\n🔄 Testing HYBRID approach (Lichess + Stockfish fallback)...`);

  const hybridPool = new StockfishPool(4);
  await hybridPool.initialize();

  const hybridResult = await benchmarkHybrid(allPositions, hybridPool);
  await hybridPool.shutdown();

  const hybridCacheHitRate = ((hybridResult.lichessHits / allPositions.length) * 100).toFixed(1);

  console.log(`   Lichess cache hits: ${hybridResult.lichessHits}/${allPositions.length} (${hybridCacheHitRate}%)`);
  console.log(`   Stockfish fallbacks: ${hybridResult.stockfishFallbacks}`);
  console.log(`   Total time: ${(hybridResult.timeMs / 1000).toFixed(1)}s`);

  results.push({
    approach: `Hybrid (Lichess + SF×4)`,
    totalPositions: allPositions.length,
    totalTimeMs: hybridResult.timeMs,
    avgTimePerPosition: hybridResult.timeMs / allPositions.length,
    avgTimePerGame: hybridResult.timeMs / games.length,
    positionsPerSecond: allPositions.length / (hybridResult.timeMs / 1000)
  });

  // ============== Test 2-4: Pure Stockfish with different pool sizes ==============
  for (const poolSize of STOCKFISH_POOL_SIZES) {
    console.log(`\n⚡ Testing PURE STOCKFISH with ${poolSize} engines...`);

    const sfTime = await benchmarkPureStockfish(allPositions, poolSize);

    console.log(`   Total time: ${(sfTime / 1000).toFixed(1)}s`);

    results.push({
      approach: `Pure Stockfish ×${poolSize}`,
      totalPositions: allPositions.length,
      totalTimeMs: sfTime,
      avgTimePerPosition: sfTime / allPositions.length,
      avgTimePerGame: sfTime / games.length,
      positionsPerSecond: allPositions.length / (sfTime / 1000)
    });
  }

  // ============== Results Summary ==============
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              BENCHMARK RESULTS                               ║');
  console.log('╠═══════════════════════════╦═══════════╦═══════════╦═══════════╦═════════════╣');
  console.log('║ Approach                  ║ Total (s) ║ Per Game  ║ Per Pos   ║ Pos/sec     ║');
  console.log('╠═══════════════════════════╬═══════════╬═══════════╬═══════════╬═════════════╣');

  for (const r of results) {
    const approach = r.approach.padEnd(25);
    const total = (r.totalTimeMs / 1000).toFixed(1).padStart(7) + 's';
    const perGame = (r.avgTimePerGame / 1000).toFixed(1).padStart(7) + 's';
    const perPos = r.avgTimePerPosition.toFixed(0).padStart(7) + 'ms';
    const posPerSec = r.positionsPerSecond.toFixed(1).padStart(9);
    console.log(`║ ${approach} ║ ${total} ║ ${perGame} ║ ${perPos} ║ ${posPerSec} ║`);
  }

  console.log('╚═══════════════════════════╩═══════════╩═══════════╩═══════════╩═════════════╝');

  // ============== Projections ==============
  const fastest = results.reduce((a, b) => a.avgTimePerGame < b.avgTimePerGame ? a : b);

  console.log('\n📈 PROJECTIONS (using fastest approach: ' + fastest.approach + ')');
  console.log('─'.repeat(50));

  const gameCounts = [100, 200, 500, 1000];
  for (const count of gameCounts) {
    const estimatedMs = fastest.avgTimePerGame * count;
    const minutes = estimatedMs / 1000 / 60;
    const hours = minutes / 60;

    if (hours >= 1) {
      console.log(`   ${count.toString().padStart(4)} games: ~${hours.toFixed(1)} hours`);
    } else {
      console.log(`   ${count.toString().padStart(4)} games: ~${minutes.toFixed(0)} minutes`);
    }
  }

  // ============== Recommendation ==============
  console.log('\n💡 RECOMMENDATION');
  console.log('─'.repeat(50));

  const hybrid = results[0];
  const sf8 = results.find(r => r.approach.includes('×8'));
  const sf12 = results.find(r => r.approach.includes('×12'));

  if (sf8 && sf8.totalTimeMs < hybrid.totalTimeMs * 0.8) {
    const improvement = ((1 - sf8.totalTimeMs / hybrid.totalTimeMs) * 100).toFixed(0);
    console.log(`   Pure Stockfish ×8 is ${improvement}% faster than hybrid.`);
    console.log(`   Consider switching to pure Stockfish for bulk analysis.`);
  } else if (sf12 && sf12.totalTimeMs < hybrid.totalTimeMs * 0.8) {
    const improvement = ((1 - sf12.totalTimeMs / hybrid.totalTimeMs) * 100).toFixed(0);
    console.log(`   Pure Stockfish ×12 is ${improvement}% faster than hybrid.`);
    console.log(`   Consider switching to pure Stockfish for bulk analysis.`);
  } else {
    console.log(`   Hybrid approach is competitive. Lichess cache helps for common positions.`);
    console.log(`   Consider keeping hybrid for diverse game analysis.`);
  }
}

// Run the benchmark
runBenchmark().catch(console.error);
