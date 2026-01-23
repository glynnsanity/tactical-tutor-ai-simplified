import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadSummaries } from '../summaries/store';
import { extractAllFeatures } from '../analysis/features';
import { discoverPatterns } from '../analysis/patterns';
import { generateInsights } from '../analysis/insights';

const InsightsQuerySchema = z.object({
  userId: z.string().min(1),
  minFrequency: z.coerce.number().min(1).max(100).optional().default(5),
  minImpact: z.coerce.number().min(10).max(500).optional().default(30),
  maxPatterns: z.coerce.number().min(1).max(50).optional().default(20),
  minCorrelation: z.coerce.number().min(0).max(1).optional().default(0.15),
});

export default async function insightsRoutes(app: FastifyInstance) {
  /**
   * GET /insights?userId=xxx
   * 
   * Returns personalized chess insights based on game analysis
   */
  app.get('/insights', async (req, reply) => {
    const parse = InsightsQuerySchema.safeParse(req.query);
    
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Invalid query parameters',
        details: parse.error.flatten()
      });
    }
    
    const { userId, minFrequency, minImpact, maxPatterns, minCorrelation } = parse.data;
    
    try {
      app.log.info(`[Insights] Generating insights for user: ${userId}`);
      const startTime = Date.now();
      
      // Step 1: Load game summaries
      const summaries = await loadSummaries(userId);
      
      if (!summaries || summaries.length === 0) {
        return reply.code(404).send({
          error: 'No games found',
          message: `No game data found for user ${userId}. Please ingest games first.`
        });
      }
      
      app.log.info(`[Insights] Loaded ${summaries.length} games`);
      
      // Step 2: Extract features
      const features = extractAllFeatures(summaries);
      app.log.info(`[Insights] Extracted ${features.length} position features`);
      
      // Step 3: Discover patterns
      const patterns = discoverPatterns(features, {
        minFrequency,
        minImpact,
        maxPatterns,
        minCorrelation
      });
      
      app.log.info(`[Insights] Discovered ${patterns.length} patterns`);
      
      // Step 4: Generate insights
      const insights = generateInsights(patterns, summaries);
      
      const endTime = Date.now();
      app.log.info(`[Insights] Generated ${insights.length} insights in ${endTime - startTime}ms`);
      
      // Return comprehensive response
      return reply.send({
        userId,
        insights,
        statistics: {
          totalGames: summaries.length,
          totalPositions: features.length,
          patternsDiscovered: patterns.length,
          insightsGenerated: insights.length,
          analysisTimeMs: endTime - startTime,
          potentialRatingGain: insights.reduce((sum, i) => sum + i.estimatedRatingImpact, 0)
        },
        patterns: patterns.map(p => ({
          id: p.id,
          type: p.type,
          name: p.name,
          description: p.description,
          frequency: p.frequency,
          impact: p.impact,
          priority: p.priority,
          correlation: p.correlation,
          confidence: p.confidence
        }))
      });
      
    } catch (error: any) {
      app.log.error({ error }, '[Insights] Failed to generate insights');
      return reply.code(500).send({
        error: 'Failed to generate insights',
        message: error.message || 'An unexpected error occurred'
      });
    }
  });
  
  /**
   * GET /insights/:userId/pattern/:patternId
   * 
   * Get detailed information about a specific pattern
   */
  app.get('/insights/:userId/pattern/:patternId', async (req, reply) => {
    const { userId, patternId } = req.params as { userId: string; patternId: string };
    
    try {
      const summaries = await loadSummaries(userId);
      if (!summaries || summaries.length === 0) {
        return reply.code(404).send({ error: 'No games found' });
      }
      
      const features = extractAllFeatures(summaries);
      const patterns = discoverPatterns(features, {
        minFrequency: 5,
        minImpact: 30,
        maxPatterns: 50
      });
      
      const pattern = patterns.find(p => p.id === patternId);
      
      if (!pattern) {
        return reply.code(404).send({ error: 'Pattern not found' });
      }
      
      // Enhance pattern with game details
      const enhancedExamples = pattern.examples.map(ex => {
        const game = summaries.find(g => g.gameId === ex.gameId);
        return {
          ...ex,
          opponent: game?.opponent || 'Unknown',
          chesscomUrl: game?.chesscomUrl || null,
          userColor: game?.userColor || null,
          opening: game?.opening || null,
          result: game?.result || null
        };
      });
      
      return reply.send({
        ...pattern,
        examples: enhancedExamples
      });
      
    } catch (error: any) {
      app.log.error({ error }, '[Insights] Failed to get pattern details');
      return reply.code(500).send({
        error: 'Failed to get pattern details',
        message: error.message
      });
    }
  });
}

