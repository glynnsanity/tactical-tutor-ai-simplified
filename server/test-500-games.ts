/**
 * Test: Ingest 500 games with pure Stockfish analysis
 *
 * This test measures real-world performance of the optimized analysis pipeline.
 *
 * Usage: npx tsx server/test-500-games.ts
 */

const API_BASE = 'http://localhost:8787';
const USERNAME = 'midnightcontender';
const TEST_USER_ID = `test-500-games-${Date.now()}`; // Fresh userId to avoid cache
const TARGET_GAMES = 500;

interface IngestResponse {
  userId: string;
  added: number;
  total: number;
  skipped?: number;
  backgroundAnalysisStarted?: boolean;
  error?: string;
}

async function runTest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           500 Game Ingestion Test                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Username: ${USERNAME}`);
  console.log(`Target games: ${TARGET_GAMES}`);
  console.log(`Test userId: ${TEST_USER_ID}`);
  console.log();

  const startTime = Date.now();
  let lastUpdate = startTime;
  let gamesProcessed = 0;

  console.log('Starting ingestion...');
  console.log('─'.repeat(60));

  try {
    // Call ingest endpoint - this will process all games synchronously
    // (quickStart=false means wait for all games to complete)
    const url = `${API_BASE}/ingest/chesscom?username=${USERNAME}&userId=${TEST_USER_ID}&limitGames=${TARGET_GAMES}&quickStart=false`;

    console.log(`[${formatTime(0)}] Fetching games from Chess.com...`);
    console.log(`[${formatTime(0)}] This will take a while (~65-90 min for 500 games)...`);

    // Use AbortController with 2-hour timeout for long-running analysis
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2 * 60 * 60 * 1000); // 2 hours

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ingest failed: ${response.status} - ${text}`);
    }

    const result = await response.json() as IngestResponse;

    const elapsed = Date.now() - startTime;

    console.log();
    console.log('═'.repeat(60));
    console.log('                         RESULTS');
    console.log('═'.repeat(60));
    console.log();
    console.log(`✅ Ingestion complete!`);
    console.log();
    console.log(`   Games processed: ${result.added}`);
    console.log(`   Total time: ${formatTime(elapsed)}`);
    console.log(`   Avg per game: ${(elapsed / result.added / 1000).toFixed(2)}s`);
    console.log(`   Games per minute: ${(result.added / (elapsed / 60000)).toFixed(1)}`);
    console.log();

    // Calculate positions (estimate ~85 positions per game based on benchmark)
    const estimatedPositions = result.added * 85;
    console.log(`   Estimated positions analyzed: ~${estimatedPositions.toLocaleString()}`);
    console.log(`   Estimated positions/sec: ~${(estimatedPositions / (elapsed / 1000)).toFixed(0)}`);
    console.log();

    // Projections
    console.log('─'.repeat(60));
    console.log('Projections based on this test:');
    console.log();
    const msPerGame = elapsed / result.added;
    const projections = [100, 200, 500, 1000, 2000, 5000];
    for (const count of projections) {
      const projectedMs = msPerGame * count;
      console.log(`   ${count.toString().padStart(5)} games: ${formatTime(projectedMs)}`);
    }

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error();
    console.error(`❌ Error after ${formatTime(elapsed)}:`);
    console.error(error);
    process.exit(1);
  }
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Run the test
runTest();
