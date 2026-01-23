/**
 * Test script for hybrid position analysis
 * Run with: npx tsx test-analysis.ts
 */

import { analyzePosition, logAnalysisStats, resetAnalysisStats } from './src/services/positionAnalyzer';
import { testStockfish } from './src/services/stockfish';
import { isLichessAvailable } from './src/services/lichess';

async function main() {
  console.log('🧪 Testing Hybrid Position Analysis\n');

  // Test 1: Check if services are available
  console.log('1️⃣ Checking services...');
  const stockfishOk = await testStockfish();
  console.log(`   Stockfish: ${stockfishOk ? '✅ Working' : '❌ Failed'}`);
  
  const lichessOk = await isLichessAvailable();
  console.log(`   Lichess API: ${lichessOk ? '✅ Available' : '⚠️ Unavailable'}\n`);

  if (!stockfishOk) {
    console.error('❌ Stockfish is not working. Cannot continue.');
    process.exit(1);
  }

  // Test 2: Analyze starting position (should be in Lichess cache)
  console.log('2️⃣ Testing starting position (should hit Lichess cache)...');
  resetAnalysisStats();
  const startPos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const result1 = await analyzePosition(startPos);
  console.log(`   Source: ${result1.source}`);
  console.log(`   Depth: ${result1.depth}`);
  console.log(`   Eval: ${(result1.eval / 100).toFixed(2)}`);
  console.log(`   Best move: ${result1.bestMove}\n`);

  // Test 3: Analyze unusual position (likely not in Lichess cache)
  console.log('3️⃣ Testing unusual position (likely Stockfish fallback)...');
  const unusualPos = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'; // Simple endgame
  const result2 = await analyzePosition(unusualPos);
  console.log(`   Source: ${result2.source}`);
  console.log(`   Depth: ${result2.depth}`);
  console.log(`   Eval: ${(result2.eval / 100).toFixed(2)}`);
  console.log(`   Best move: ${result2.bestMove}\n`);

  // Test 4: Analyze tactical position
  console.log('4️⃣ Testing tactical position...');
  const tacticalPos = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'; // Italian Game
  const result3 = await analyzePosition(tacticalPos);
  console.log(`   Source: ${result3.source}`);
  console.log(`   Depth: ${result3.depth}`);
  console.log(`   Eval: ${(result3.eval / 100).toFixed(2)}`);
  console.log(`   Best move: ${result3.bestMove}\n`);

  // Test 5: Batch analysis (simulate analyzing a game)
  console.log('5️⃣ Testing batch analysis (10 positions)...');
  const positions = [
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4',
    'r1bqkb1r/pppp1ppp/2n2n2/8/2BpP3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
    'r1bqkb1r/pppp1ppp/2n2n2/8/2BNP3/3P4/PPP2PPP/RNBQK2R b KQkq - 0 5',
    'r1bqkb1r/pppp1ppp/5n2/8/2BnP3/3P4/PPP2PPP/RNBQK2R w KQkq - 0 6'
  ];

  const startTime = Date.now();
  for (let i = 0; i < positions.length; i++) {
    await analyzePosition(positions[i]);
    console.log(`   Analyzed ${i + 1}/10 positions...`);
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ Completed in ${elapsed}s\n`);

  // Show statistics
  console.log('📊 Final Statistics:');
  logAnalysisStats();

  console.log('✅ All tests completed successfully!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

