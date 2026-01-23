/**
 * Test script for game analysis with position evaluations
 * Run with: npx tsx test-game-analysis.ts
 */

import { pgnToSummary } from './src/ingest/pgnToSummary';
import { logAnalysisStats, resetAnalysisStats } from './src/services/positionAnalyzer';

// Sample PGN from your data (Italian Game)
const samplePGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.02.01"]
[Round "-"]
[White "midnightcontender"]
[Black "j00otp"]
[Result "1-0"]
[ECO "C50"]
[WhiteElo "725"]
[BlackElo "690"]
[TimeControl "300"]
[Termination "midnightcontender won by checkmate"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 h6 4. d4 d6 5. Nc3 Nf6 6. O-O Bg4 7. Bd5 Bxf3 
8. Qxf3 Nxd4 9. Qh3 Nxc2 10. Rb1 c6 11. Bb3 Nd4 12. f4 exf4 13. Rxf4 Be7 
14. Be3 Nxb3 15. axb3 d5 16. Rd1 Bb4 17. e5 O-O 18. exf6 Bxc3 19. bxc3 gxf6 
20. Qxh6 Re8 21. Rg4# 1-0`;

async function main() {
  console.log('🧪 Testing Game Analysis with Position Evaluations\n');
  
  console.log('📋 Analyzing sample game...');
  console.log('   Opening: Italian Game (C50)');
  console.log('   Result: White wins by checkmate\n');
  
  resetAnalysisStats();
  const startTime = Date.now();
  
  const summary = await pgnToSummary(samplePGN, 'midnightcontender');
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  if (!summary) {
    console.error('❌ Failed to parse game');
    process.exit(1);
  }
  
  console.log(`✅ Game analyzed in ${elapsed}s\n`);
  
  console.log('📊 Game Summary:');
  console.log(`   Game ID: ${summary.gameId}`);
  console.log(`   Date: ${summary.date}`);
  console.log(`   Opening: ${summary.opening.name} (${summary.opening.eco})`);
  console.log(`   Result: ${summary.result}`);
  console.log(`   User Color: ${summary.userColor}`);
  console.log(`   User Rating: ${summary.userRating}`);
  console.log(`   Opponent Rating: ${summary.oppRating}`);
  console.log(`   Time Control: ${summary.timeControl.type}\n`);
  
  console.log('🎯 Key Positions with Evaluations:');
  for (const pos of summary.keyPositions) {
    console.log(`\n   Move ${pos.moveNo} (${pos.side}):`);
    console.log(`   Tags: ${pos.tag.join(', ')}`);
    console.log(`   FEN: ${pos.fen}`);
    if (pos.evalBefore !== null) {
      console.log(`   Eval Before: ${pos.evalBefore > 0 ? '+' : ''}${pos.evalBefore.toFixed(2)}`);
    }
    if (pos.evalAfter !== null) {
      console.log(`   Eval After: ${pos.evalAfter > 0 ? '+' : ''}${pos.evalAfter.toFixed(2)}`);
      if (pos.evalBefore !== null) {
        const swing = pos.evalAfter - pos.evalBefore;
        console.log(`   Eval Swing: ${swing > 0 ? '+' : ''}${swing.toFixed(2)}`);
      }
    }
    if (pos.bestMove) {
      console.log(`   Best Move: ${pos.bestMove}`);
    }
  }
  
  console.log('\n\n📈 Analysis Statistics:');
  logAnalysisStats();
  
  console.log('✅ Test completed successfully!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

