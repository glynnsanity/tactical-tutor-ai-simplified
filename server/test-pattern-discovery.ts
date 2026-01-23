#!/usr/bin/env tsx

import { loadSummaries } from './src/summaries/store';
import { extractAllFeatures } from './src/analysis/features';
import { discoverPatterns } from './src/analysis/patterns';

async function testPatternDiscovery() {
  console.log('🔬 Testing Pattern Discovery System\n');
  console.log('=' .repeat(70));
  
  const userId = 'midnightcontender';
  
  // Load game summaries
  console.log(`\n📁 Loading games for user: ${userId}`);
  const summaries = await loadSummaries(userId);
  
  if (!summaries || summaries.length === 0) {
    console.log('❌ No games found');
    return;
  }
  
  console.log(`✅ Loaded ${summaries.length} games`);
  
  // Extract features
  console.log('🔬 Extracting features...');
  const features = extractAllFeatures(summaries);
  console.log(`✅ Extracted ${features.length} position features`);
  
  // Discover patterns
  const patterns = discoverPatterns(features, {
    minFrequency: 5, // Lower threshold for testing
    minImpact: 30, // 0.3 pawns
    maxPatterns: 20,
    minCorrelation: 0.15
  });
  
  // Display results
  console.log('\n' + '='.repeat(70));
  console.log('🎯 DISCOVERED PATTERNS\n');
  
  if (patterns.length === 0) {
    console.log('❌ No patterns found matching the criteria');
    return;
  }
  
  // Group by type
  const byType = {
    weakness: patterns.filter(p => p.type === 'weakness'),
    strength: patterns.filter(p => p.type === 'strength'),
    situational: patterns.filter(p => p.type === 'situational'),
  };
  
  console.log(`Total patterns: ${patterns.length}`);
  console.log(`  Weaknesses: ${byType.weakness.length}`);
  console.log(`  Strengths: ${byType.strength.length}`);
  console.log(`  Situational: ${byType.situational.length}\n`);
  
  // Display top 10 patterns
  console.log('📊 TOP 10 PATTERNS (by priority):\n');
  
  for (let i = 0; i < Math.min(10, patterns.length); i++) {
    const p = patterns[i];
    console.log(`${i + 1}. ${p.name} [${p.type.toUpperCase()}]`);
    console.log(`   Priority: ${p.priority}/10`);
    console.log(`   ${p.description}`);
    console.log(`   Frequency: ${p.frequency} positions`);
    console.log(`   Impact: ${p.impact}cp average ${p.impact < 0 ? 'loss' : 'gain'}`);
    console.log(`   Correlation: ${p.correlation.toFixed(3)} (p=${p.pValue.toFixed(3)})`);
    console.log(`   Confidence: ${(p.confidence * 100).toFixed(1)}%`);
    
    if (Object.keys(p.conditions).length > 0) {
      console.log(`   Conditions: ${JSON.stringify(p.conditions)}`);
    }
    
    console.log(`   Recommendation: ${p.recommendation}`);
    
    if (p.examples.length > 0) {
      console.log(`   Example: Game ${p.examples[0].gameId}, move ${p.examples[0].moveNo} (${p.examples[0].evalSwing}cp swing)`);
    }
    
    console.log('');
  }
  
  // Show detailed breakdown of top weakness
  if (byType.weakness.length > 0) {
    console.log('='.repeat(70));
    console.log('🔴 BIGGEST WEAKNESS (Detailed Analysis):\n');
    
    const topWeakness = byType.weakness[0];
    console.log(`Pattern: ${topWeakness.name}`);
    console.log(`Type: ${topWeakness.type}`);
    console.log(`\nDescription:`);
    console.log(`  ${topWeakness.description}`);
    console.log(`\nStatistics:`);
    console.log(`  Appears in: ${topWeakness.frequency} positions`);
    console.log(`  Average impact: ${topWeakness.impact}cp loss per occurrence`);
    console.log(`  Correlation: ${topWeakness.correlation.toFixed(3)}`);
    console.log(`  Statistical significance: p=${topWeakness.pValue.toFixed(3)}`);
    console.log(`  Confidence: ${(topWeakness.confidence * 100).toFixed(1)}%`);
    console.log(`  Priority: ${topWeakness.priority}/10`);
    
    // Calculate total impact
    const totalImpact = Math.abs(topWeakness.impact * topWeakness.frequency);
    const gamesAffected = new Set(topWeakness.examples.map(e => e.gameId)).size;
    console.log(`\nTotal Impact:`);
    console.log(`  Total eval loss: ~${totalImpact}cp across all occurrences`);
    console.log(`  Games affected: ${gamesAffected}`);
    console.log(`  Estimated rating impact: ~${Math.round(totalImpact / 100)} rating points`);
    
    console.log(`\nRecommendation:`);
    console.log(`  ${topWeakness.recommendation}`);
    
    console.log(`\nTop 3 Examples:`);
    for (let i = 0; i < Math.min(3, topWeakness.examples.length); i++) {
      const ex = topWeakness.examples[i];
      console.log(`  ${i + 1}. Game ${ex.gameId}, move ${ex.moveNo}`);
      console.log(`     Eval swing: ${ex.evalSwing}cp`);
      console.log(`     Context: ${ex.context}`);
      console.log(`     FEN: ${ex.fen}`);
    }
  }
  
  // Show detailed breakdown of top strength
  if (byType.strength.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('🟢 BIGGEST STRENGTH:\n');
    
    const topStrength = byType.strength[0];
    console.log(`Pattern: ${topStrength.name}`);
    console.log(`Description: ${topStrength.description}`);
    console.log(`Frequency: ${topStrength.frequency} positions`);
    console.log(`Average impact: +${Math.abs(topStrength.impact)}cp gain`);
    console.log(`Recommendation: ${topStrength.recommendation}`);
  }
  
  // Show situational patterns
  if (byType.situational.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 SITUATIONAL PATTERNS (Context-Specific):\n');
    
    for (const pattern of byType.situational.slice(0, 5)) {
      console.log(`• ${pattern.name}`);
      console.log(`  ${pattern.description}`);
      console.log(`  Impact: ${pattern.impact}cp, Priority: ${pattern.priority}/10`);
      console.log('');
    }
  }
  
  console.log('='.repeat(70));
  console.log('✅ Pattern discovery test complete!');
}

testPatternDiscovery().catch(console.error);

