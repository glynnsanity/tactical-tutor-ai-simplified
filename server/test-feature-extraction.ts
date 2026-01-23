#!/usr/bin/env tsx

import { loadSummaries } from './src/summaries/store';
import { extractAllFeatures } from './src/analysis/features';

async function testFeatureExtraction() {
  console.log('🧪 Testing Feature Extraction System\n');
  console.log('=' .repeat(50));
  
  const userId = 'midnightcontender';
  
  // Load game summaries
  console.log(`📁 Loading games for user: ${userId}`);
  const summaries = await loadSummaries(userId);
  
  if (!summaries || summaries.length === 0) {
    console.log('❌ No games found');
    return;
  }
  
  console.log(`✅ Loaded ${summaries.length} games\n`);
  
  // Extract features
  console.log('🔬 Extracting features from all positions...');
  const startTime = Date.now();
  const features = extractAllFeatures(summaries);
  const endTime = Date.now();
  
  console.log(`✅ Extracted ${features.length} position features in ${endTime - startTime}ms\n`);
  
  // Analyze a sample position
  if (features.length > 0) {
    const sample = features[0];
    console.log('📊 Sample Position Features:\n');
    console.log(`Game ID: ${sample.gameId}`);
    console.log(`Move: ${sample.moveNo}`);
    console.log(`FEN: ${sample.fen}`);
    console.log(`\nMaterial:`);
    console.log(`  Balance: ${sample.material_balance}cp`);
    console.log(`  Total: ${sample.material_total}`);
    console.log(`  Queens on board: ${sample.has_queens}`);
    console.log(`\nPawn Structure (User):`);
    console.log(`  Doubled: ${sample.doubled_pawns_user}`);
    console.log(`  Isolated: ${sample.isolated_pawns_user}`);
    console.log(`  Backward: ${sample.backward_pawns_user}`);
    console.log(`  Pawn islands: ${sample.pawn_islands_user}`);
    console.log(`\nKing Safety (User):`);
    console.log(`  Pawn shield: ${sample.king_pawn_shield_user}`);
    console.log(`  Castled: ${sample.king_castled_user}`);
    console.log(`  In center: ${sample.king_in_center_user}`);
    console.log(`\nMove Quality:`);
    console.log(`  Eval before: ${sample.eval_before_cp}cp`);
    console.log(`  Eval after: ${sample.eval_after_cp}cp`);
    console.log(`  Swing: ${sample.eval_swing_cp}cp`);
    console.log(`  Accuracy: ${(sample.move_accuracy * 100).toFixed(1)}%`);
    console.log(`  Was best move: ${sample.was_best_move}`);
    console.log(`  Was blunder: ${sample.was_blunder}`);
    console.log(`\nContext:`);
    console.log(`  Time control: ${sample.time_control}`);
    console.log(`  Game phase: ${sample.game_phase}`);
    console.log(`  User color: ${sample.user_color}`);
    console.log(`  Rating: ${sample.user_rating} vs ${sample.opponent_rating} (diff: ${sample.rating_diff})`);
    console.log(`  Opening: ${sample.opening_eco} - ${sample.opening_name}`);
    console.log(`  Result: ${sample.game_result}`);
    console.log(`  Move side: ${sample.move_side}`);
  }
  
  // Summary statistics
  console.log('\n' + '='.repeat(50));
  console.log('📈 Feature Extraction Summary:\n');
  
  const blunders = features.filter(f => f.was_blunder && f.move_side === 'user');
  const mistakes = features.filter(f => f.was_mistake && f.move_side === 'user');
  const inaccuracies = features.filter(f => f.was_inaccuracy && f.move_side === 'user');
  
  console.log(`Total positions: ${features.length}`);
  console.log(`User's moves: ${features.filter(f => f.move_side === 'user').length}`);
  console.log(`Opponent's moves: ${features.filter(f => f.move_side === 'opponent').length}`);
  console.log(`\nUser's move quality:`);
  console.log(`  Blunders: ${blunders.length}`);
  console.log(`  Mistakes: ${mistakes.length}`);
  console.log(`  Inaccuracies: ${inaccuracies.length}`);
  console.log(`  Total errors: ${blunders.length + mistakes.length + inaccuracies.length}`);
  
  const avgAccuracy = features
    .filter(f => f.move_side === 'user')
    .reduce((sum, f) => sum + f.move_accuracy, 0) / features.filter(f => f.move_side === 'user').length;
  
  console.log(`  Average accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
  
  // Phase breakdown
  const byPhase = {
    opening: features.filter(f => f.game_phase === 'opening' && f.move_side === 'user'),
    middlegame: features.filter(f => f.game_phase === 'middlegame' && f.move_side === 'user'),
    endgame: features.filter(f => f.game_phase === 'endgame' && f.move_side === 'user'),
  };
  
  console.log(`\nBy phase:`);
  for (const [phase, positions] of Object.entries(byPhase)) {
    const avgAcc = positions.reduce((sum, f) => sum + f.move_accuracy, 0) / positions.length;
    const errors = positions.filter(f => f.was_blunder || f.was_mistake || f.was_inaccuracy).length;
    console.log(`  ${phase}: ${positions.length} positions, ${(avgAcc * 100).toFixed(1)}% accuracy, ${errors} errors`);
  }
  
  // Time control breakdown
  const byTimeControl = {
    bullet: features.filter(f => f.time_control === 'bullet' && f.move_side === 'user'),
    blitz: features.filter(f => f.time_control === 'blitz' && f.move_side === 'user'),
    rapid: features.filter(f => f.time_control === 'rapid' && f.move_side === 'user'),
  };
  
  console.log(`\nBy time control:`);
  for (const [tc, positions] of Object.entries(byTimeControl)) {
    if (positions.length > 0) {
      const avgAcc = positions.reduce((sum, f) => sum + f.move_accuracy, 0) / positions.length;
      const errors = positions.filter(f => f.was_blunder || f.was_mistake || f.was_inaccuracy).length;
      console.log(`  ${tc}: ${positions.length} positions, ${(avgAcc * 100).toFixed(1)}% accuracy, ${errors} errors`);
    }
  }
  
  console.log('\n✅ Feature extraction test complete!');
}

testFeatureExtraction().catch(console.error);

