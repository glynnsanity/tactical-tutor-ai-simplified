import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listArchives, fetchArchive } from '../ingest/chesscom';
import { pgnToSummary } from '../ingest/pgnToSummary';
import { upsertSummaries, loadSummaries } from '../summaries/store';

const Query = z.object({
  username: z.string().min(1),
  userId: z.string().min(1),
  limitMonths: z.coerce.number().int().min(1).max(120).default(12), // Default to 1 year
  limitGames: z.coerce.number().int().min(1).max(1000).default(100), // Default to last 100 games
  quickStart: z.coerce.boolean().optional().default(false), // Enable progressive analysis
  quickStartGames: z.coerce.number().int().min(5).max(50).optional().default(10), // Quick start game count
});

export default async function ingestRoutes(app: FastifyInstance) {
  app.get('/ingest/chesscom', async (req, reply) => {
    const parse = Query.safeParse((req as any).query);
    if (!parse.success) return reply.code(400).send({ error: 'Invalid query', details: parse.error.flatten() });
    const { username, userId, limitMonths, limitGames, quickStart, quickStartGames } = parse.data;

    try {
      const archives = (await listArchives(username)).slice(0, limitMonths);
      
      // Quick start mode: Analyze a few games quickly, then continue in background
      if (quickStart) {
        // Phase 1: Quick start with limited games
        const quickSummaries: any[] = [];
        let gamesProcessed = 0;
        
        archiveLoop1: for (const url of archives) {
          const raw = await fetchArchive(url);
          const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);
          for (const pgn of games) {
            if (quickSummaries.length >= quickStartGames) {
              break archiveLoop1;
            }
            
            const sum = await pgnToSummary(pgn, username);
            if (sum) {
              quickSummaries.push(sum);
              gamesProcessed++;
            }
          }
        }
        
        // Save quick start results
        if (quickSummaries.length > 0) {
          await upsertSummaries(userId, quickSummaries);
        }
        
        // Start background analysis for remaining games (don't await)
        if (gamesProcessed < limitGames) {
          continueAnalysisInBackground(app, username, userId, archives, limitGames, quickStartGames).catch((err) => {
            app.log.error('Background analysis failed:', err);
          });
        }
        
        const total = (await loadSummaries(userId)).length;
        return reply.send({ 
          userId, 
          added: quickSummaries.length, 
          total,
          quickStart: true,
          backgroundAnalysisStarted: gamesProcessed < limitGames,
          message: `Quick start complete! Analyzed ${quickSummaries.length} games. ${gamesProcessed < limitGames ? 'Continuing analysis in background...' : ''}`
        });
      }
      
      // Regular mode: Analyze all games before responding
      let added = 0;
      const summaries: any[] = [];
      
      archiveLoop2: for (const url of archives) {
        const raw = await fetchArchive(url);
        const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);
        for (const pgn of games) {
          if (summaries.length >= limitGames) {
            break archiveLoop2;
          }
          
          const sum = await pgnToSummary(pgn, username);
          if (sum) {
            summaries.push(sum);
            added++;
          }
        }
      }
      
      if (summaries.length > 0) await upsertSummaries(userId, summaries);
      const total = (await loadSummaries(userId)).length;
      return reply.send({ userId, added, total, limited: summaries.length >= limitGames });
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ error: 'Ingest failed' });
    }
  });
}

/**
 * Continue analysis in background after quick start
 */
async function continueAnalysisInBackground(
  app: FastifyInstance,
  username: string,
  userId: string,
  archives: string[],
  totalGames: number,
  alreadyProcessed: number
): Promise<void> {
  app.log.info(`[Background] Starting analysis for ${username}, target: ${totalGames} games`);
  
  const summaries: any[] = [];
  let gamesProcessed = 0;
  
  archiveLoop: for (const url of archives) {
    const raw = await fetchArchive(url);
    const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);
    
    for (const pgn of games) {
      gamesProcessed++;
      
      // Skip games already processed in quick start
      if (gamesProcessed <= alreadyProcessed) {
        continue;
      }
      
      // Stop if we've reached the total game limit
      if (summaries.length >= (totalGames - alreadyProcessed)) {
        break archiveLoop;
      }
      
      const sum = await pgnToSummary(pgn, username);
      if (sum) {
        summaries.push(sum);
        
        // Save in batches of 10 to provide progressive updates
        if (summaries.length % 10 === 0) {
          await upsertSummaries(userId, summaries);
          app.log.info(`[Background] Saved ${summaries.length} more games for ${username}`);
          summaries.length = 0; // Clear batch
        }
      }
    }
  }
  
  // Save any remaining games
  if (summaries.length > 0) {
    await upsertSummaries(userId, summaries);
  }
  
  const total = (await loadSummaries(userId)).length;
  app.log.info(`[Background] Analysis complete for ${username}. Total games: ${total}`);
}


