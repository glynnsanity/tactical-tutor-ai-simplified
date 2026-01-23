#!/usr/bin/env tsx

import { loadSummaries } from './src/summaries/store';
import { extractAllFeatures } from './src/analysis/features';
import { discoverPatterns } from './src/analysis/patterns';
import { generateInsights } from './src/analysis/insights';

async function testInsights() {
  console.log('💡 Testing Complete Insights System\n');
  console.log('=' .repeat(80));
  
  const userId = 'midnightcontender';
  
  // Step 1: Load games
  console.log(`\n📁 Step 1: Loading games for user: ${userId}`);
  const summaries = await loadSummaries(userId);
  
  if (!summaries || summaries.length === 0) {
    console.log('❌ No games found');
    return;
  }
  
  console.log(`✅ Loaded ${summaries.length} games`);
  
  // Step 2: Extract features
  console.log('\n🔬 Step 2: Extracting features from positions...');
  const startExtract = Date.now();
  const features = extractAllFeatures(summaries);
  const extractTime = Date.now() - startExtract;
  console.log(`✅ Extracted ${features.length} position features in ${extractTime}ms`);
  
  // Step 3: Discover patterns
  console.log('\n📊 Step 3: Discovering patterns...');
  const startPatterns = Date.now();
  const patterns = discoverPatterns(features, {
    minFrequency: 10,     // Increased from 5 for better quality
    minImpact: 50,        // Increased from 30 for better quality
    maxPatterns: 20,
    minCorrelation: 0.35  // Increased from 0.15 to filter noise
  });
  const patternsTime = Date.now() - startPatterns;
  console.log(`✅ Discovered ${patterns.length} patterns in ${patternsTime}ms`);
  
  // Step 4: Generate insights
  console.log('\n💡 Step 4: Generating actionable insights...');
  const startInsights = Date.now();
  const insights = generateInsights(patterns, summaries);
  const insightsTime = Date.now() - startInsights;
  console.log(`✅ Generated ${insights.length} insights in ${insightsTime}ms`);
  
  const totalTime = extractTime + patternsTime + insightsTime;
  console.log(`\n⏱️  Total analysis time: ${totalTime}ms`);
  
  // Display insights
  console.log('\n' + '='.repeat(80));
  console.log('🎯 YOUR CHESS INSIGHTS\n');
  
  for (let i = 0; i < insights.length; i++) {
    const insight = insights[i];
    
    console.log('='.repeat(80));
    console.log(`\n${i + 1}. ${insight.title.toUpperCase()}`);
    console.log(`   Category: ${insight.category} | Priority: ${insight.priority}/10 | Confidence: ${(insight.confidence * 100).toFixed(0)}%`);
    console.log(`\n📋 Summary:`);
    console.log(`   ${insight.summary}`);
    console.log(`\n💥 Impact:`);
    console.log(`   ${insight.impact}`);
    console.log(`   Estimated rating gain: ${insight.estimatedRatingImpact >= 0 ? '+' : ''}${insight.estimatedRatingImpact} points`);
    
    console.log(`\n🎯 Action Plan:`);
    console.log(`\n   ⚡ DO THIS RIGHT NOW:`);
    console.log(`      ${insight.actionPlan.immediate}`);
    
    console.log(`\n   📝 In Your Next 10 Games:`);
    insight.actionPlan.nextGames.forEach((action, idx) => {
      console.log(`      ${idx + 1}. ${action}`);
    });
    
    console.log(`\n   📚 Study Plan:`);
    insight.actionPlan.studyPlan.forEach((topic, idx) => {
      console.log(`      ${idx + 1}. ${topic}`);
    });
    
    if (insight.actionPlan.resources && insight.actionPlan.resources.length > 0) {
      console.log(`\n   🔗 Resources:`);
      insight.actionPlan.resources.forEach(resource => {
        console.log(`      • ${resource}`);
      });
    }
    
    console.log(`\n📊 Evidence:`);
    console.log(`   Based on ${insight.evidence.totalPositions} positions across ${insight.evidence.totalGames} games`);
    
    if (insight.evidence.exampleGames.length > 0) {
      console.log(`\n   Example Positions:`);
      insight.evidence.exampleGames.forEach((game, idx) => {
        console.log(`      ${idx + 1}. vs ${game.opponent} - Move ${game.moveNo} (${game.evalLoss}cp)`);
        console.log(`         ${game.description}`);
        if (game.chesscomUrl) {
          console.log(`         View game: ${game.chesscomUrl}`);
        }
        console.log(`         FEN: ${game.fen}`);
      });
    }
    
    console.log('');
  }
  
  // Summary
  console.log('='.repeat(80));
  console.log('\n📈 ANALYSIS SUMMARY:\n');
  console.log(`Total games analyzed: ${summaries.length}`);
  console.log(`Total positions analyzed: ${features.length}`);
  console.log(`Patterns discovered: ${patterns.length}`);
  console.log(`Actionable insights generated: ${insights.length}`);
  console.log(`Total potential rating gain: +${insights.reduce((sum, i) => sum + i.estimatedRatingImpact, 0)} points`);
  console.log(`Analysis completed in: ${totalTime}ms`);
  
  console.log('\n🎯 YOUR ACTION PLAN:\n');
  console.log('1. Start with your #1 insight (highest priority)');
  console.log('2. Implement the "DO THIS RIGHT NOW" action immediately');
  console.log('3. Focus on that one weakness for your next 10 games');
  console.log('4. Track your progress and review these insights monthly');
  console.log('5. Once you\'ve made progress on #1, move to insight #2');
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Complete insights analysis finished!\n');
}

testInsights().catch(console.error);

