import { Chess } from 'chess.js';
import { loadSummaries, upsertSummaries } from '../summaries/store';
import type { CompactGameSummaryT } from '../summaries/schemas';

// Stockfish wrapper for position analysis
class StockfishAnalyzer {
  private engine: any;
  private ready: boolean = false;

  async init() {
    const { Stockfish } = await import('stockfish.js');
    this.engine = new Stockfish();
    
    return new Promise<void>((resolve) => {
      this.engine.addMessageListener((line: string) => {
        if (line === 'uciok') {
          this.ready = true;
          resolve();
        }
      });
      this.engine.postMessage('uci');
    });
  }

  async analyze(fen: string, depth: number = 15): Promise<{ eval: number; bestMove: string }> {
    if (!this.ready) throw new Error('Engine not ready');

    return new Promise((resolve) => {
      let bestMove = '';
      let evaluation = 0;

      const listener = (line: string) => {
        // Parse best move
        if (line.startsWith('bestmove')) {
          const match = line.match(/bestmove (\w+)/);
          if (match) bestMove = match[1];
        }

        // Parse evaluation (centipawns)
        if (line.includes('score cp')) {
          const match = line.match(/score cp (-?\d+)/);
          if (match) evaluation = parseInt(match[1], 10) / 100; // Convert to pawns
        }

        // Parse mate scores
        if (line.includes('score mate')) {
          const match = line.match(/score mate (-?\d+)/);
          if (match) {
            const mateIn = parseInt(match[1], 10);
            evaluation = mateIn > 0 ? 100 : -100; // Simplified: mate = +/- 100
          }
        }

        // When analysis is complete
        if (line.startsWith('bestmove')) {
          this.engine.removeMessageListener(listener);
          resolve({ eval: evaluation, bestMove });
        }
      };

      this.engine.addMessageListener(listener);
      this.engine.postMessage(`position fen ${fen}`);
      this.engine.postMessage(`go depth ${depth}`);
    });
  }

  terminate() {
    this.engine.postMessage('quit');
  }
}

async function analyzeGamePositions(
  game: CompactGameSummaryT,
  analyzer: StockfishAnalyzer
): Promise<CompactGameSummaryT> {
  console.log(`Analyzing game ${game.gameId}...`);

  // Analyze each key position
  const enhancedPositions = await Promise.all(
    game.keyPositions.map(async (kp) => {
      try {
        const analysis = await analyzer.analyze(kp.fen, 12); // Depth 12 for speed
        return {
          ...kp,
          evalAfter: analysis.eval,
          bestMove: analysis.bestMove,
        };
      } catch (error) {
        console.error(`Failed to analyze position in game ${game.gameId}:`, error);
        return kp; // Keep original if analysis fails
      }
    })
  );

  return {
    ...game,
    keyPositions: enhancedPositions,
  };
}

export async function batchAnalyzeGames(userId: string, limit?: number) {
  console.log(`Starting batch analysis for user: ${userId}`);
  
  const analyzer = new StockfishAnalyzer();
  await analyzer.init();
  console.log('Stockfish engine initialized');

  const summaries = await loadSummaries(userId);
  if (!summaries || summaries.length === 0) {
    console.log('No games found to analyze');
    return;
  }

  const toAnalyze = limit ? summaries.slice(0, limit) : summaries;
  console.log(`Analyzing ${toAnalyze.length} games...`);

  const analyzed: CompactGameSummaryT[] = [];
  
  for (let i = 0; i < toAnalyze.length; i++) {
    const game = toAnalyze[i];
    try {
      const enhancedGame = await analyzeGamePositions(game, analyzer);
      analyzed.push(enhancedGame);
      
      if ((i + 1) % 10 === 0) {
        console.log(`Progress: ${i + 1}/${toAnalyze.length} games analyzed`);
      }
    } catch (error) {
      console.error(`Failed to analyze game ${game.gameId}:`, error);
      analyzed.push(game); // Keep original
    }
  }

  // Save analyzed games
  await upsertSummaries(userId, analyzed);
  console.log(`✓ Analysis complete! ${analyzed.length} games saved.`);

  analyzer.terminate();
}

// CLI entry point
const userId = process.argv[2] || 'demo';
const limit = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

if (userId) {
  batchAnalyzeGames(userId, limit)
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Analysis failed:', error);
      process.exit(1);
    });
}

