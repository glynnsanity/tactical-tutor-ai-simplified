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
  // Note: z.coerce.boolean() treats "false" string as true! Must use transform.
  quickStart: z.string().optional().default('false').transform(v => v === 'true'),
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
      // Step 1: Collect all PGNs first (fast)
      const allPgns: string[] = [];
      for (const url of archives) {
        if (allPgns.length >= limitGames) break;
        const raw = await fetchArchive(url);
        const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);
        for (const pgn of games) {
          if (allPgns.length >= limitGames) break;
          allPgns.push(pgn);
        }
      }

      app.log.info(`[Ingest] Collected ${allPgns.length} PGNs, starting parallel analysis...`);

      // Step 2: Process games in parallel batches
      const BATCH_SIZE = 8; // Process 8 games concurrently
      const summaries: any[] = [];
      const startTime = Date.now();
      let processed = 0;

      for (let i = 0; i < allPgns.length; i += BATCH_SIZE) {
        const batch = allPgns.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(pgn => pgnToSummary(pgn, username))
        );

        // Collect valid summaries
        for (const sum of batchResults) {
          if (sum) {
            summaries.push(sum);
          }
        }

        processed += batch.length;

        // Log progress every batch
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const avgPerGame = (parseFloat(elapsed) / processed).toFixed(2);
        const gamesPerMin = (processed / (parseFloat(elapsed) / 60)).toFixed(1);
        app.log.info(`[Ingest] Progress: ${processed}/${allPgns.length} games (${elapsed}s, ${avgPerGame}s/game, ${gamesPerMin} games/min)`);
      }

      const added = summaries.length;
      
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
 * Uses parallel processing for better throughput
 */
async function continueAnalysisInBackground(
  app: FastifyInstance,
  username: string,
  userId: string,
  archives: string[],
  totalGames: number,
  alreadyProcessed: number
): Promise<void> {
  const remainingGames = totalGames - alreadyProcessed;
  app.log.info(`[Background] Starting parallel analysis for ${username}, target: ${remainingGames} more games`);

  // Collect remaining PGNs
  const allPgns: string[] = [];
  let skipped = 0;

  for (const url of archives) {
    if (allPgns.length >= remainingGames) break;
    const raw = await fetchArchive(url);
    const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);

    for (const pgn of games) {
      // Skip already processed games
      if (skipped < alreadyProcessed) {
        skipped++;
        continue;
      }
      if (allPgns.length >= remainingGames) break;
      allPgns.push(pgn);
    }
  }

  app.log.info(`[Background] Collected ${allPgns.length} PGNs for parallel processing`);

  // Process in parallel batches
  const BATCH_SIZE = 8;
  const startTime = Date.now();
  let processed = 0;
  let totalSaved = 0;

  for (let i = 0; i < allPgns.length; i += BATCH_SIZE) {
    const batch = allPgns.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(pgn => pgnToSummary(pgn, username))
    );

    const validSummaries = batchResults.filter(Boolean);
    if (validSummaries.length > 0) {
      await upsertSummaries(userId, validSummaries as any[]);
      totalSaved += validSummaries.length;
    }

    processed += batch.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgPerGame = (parseFloat(elapsed) / processed).toFixed(2);
    app.log.info(`[Background] Progress: ${processed}/${allPgns.length} games (${elapsed}s, ${avgPerGame}s/game)`);
  }

  const total = (await loadSummaries(userId)).length;
  app.log.info(`[Background] Analysis complete for ${username}. Total games: ${total}`);
}


