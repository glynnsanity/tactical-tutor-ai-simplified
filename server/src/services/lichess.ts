/**
 * Lichess Cloud Evaluation API
 * https://lichess.org/api#tag/Analysis/operation/apiCloudEval
 */

interface LichessEvaluation {
  fen: string;
  knodes: number;
  depth: number;
  pvs: Array<{
    moves: string;
    cp?: number;      // Centipawn score (e.g., 150 = +1.5 pawns)
    mate?: number;    // Mate in X moves
  }>;
}

interface Evaluation {
  fen: string;
  eval: number;       // Centipawn score (positive = white advantage)
  mate?: number;      // Mate in X moves (positive = white mates)
  depth: number;
  bestMove?: string;
  source: 'lichess' | 'stockfish';
}

/**
 * Simple rate limiter to respect Lichess API limits
 */
class RateLimiter {
  private queue: Array<() => void> = [];
  private requestsInWindow: number = 0;
  private readonly maxRequestsPerSecond: number;
  private readonly windowMs: number = 1000;

  constructor(maxRequestsPerSecond: number = 10) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    // Wait if we're at the limit
    if (this.requestsInWindow >= this.maxRequestsPerSecond) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.requestsInWindow++;

    // Reset counter after window
    setTimeout(() => {
      this.requestsInWindow--;
      const next = this.queue.shift();
      if (next) next();
    }, this.windowMs);

    return fn();
  }
}

const lichessLimiter = new RateLimiter(10); // Conservative: 10 req/sec

/**
 * Fetch position evaluation from Lichess Cloud API
 * Returns null if position not in cache or API fails
 */
export async function fetchLichessEval(
  fen: string,
  minDepth: number = 18
): Promise<Evaluation | null> {
  try {
    const result = await lichessLimiter.throttle(async () => {
      const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000); // 2s timeout

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TacticalTutorAI/1.0' // Identify your app
          }
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return null;
        }

        const data = await response.json() as LichessEvaluation;
        return data;
      } catch (error) {
        clearTimeout(timeout);
        return null;
      }
    });

    if (!result) {
      return null;
    }

    // Check if depth is sufficient
    if (result.depth < minDepth) {
      console.log(`[Lichess] Depth too low (${result.depth} < ${minDepth})`);
      return null;
    }

    // Extract evaluation from first PV (principal variation)
    const pv = result.pvs[0];
    if (!pv) {
      return null;
    }

    // Extract best move (first move in PV)
    const bestMove = pv.moves.split(' ')[0];

    return {
      fen,
      eval: pv.cp ?? (pv.mate ? pv.mate * 10000 : 0), // Convert mate to large number
      mate: pv.mate,
      depth: result.depth,
      bestMove,
      source: 'lichess'
    };
  } catch (error) {
    // Silently fail - we'll use Stockfish fallback
    return null;
  }
}

/**
 * Check if Lichess API is available (for health checks)
 */
export async function isLichessAvailable(): Promise<boolean> {
  try {
    // Test with a simple starting position
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = await fetchLichessEval(fen, 1);
    return result !== null;
  } catch {
    return false;
  }
}

