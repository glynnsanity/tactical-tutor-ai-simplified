/**
 * Streaming Analysis Route
 *
 * Provides real-time progress updates via Server-Sent Events (SSE)
 * while analyzing games in the background.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listArchives, fetchArchive } from '../ingest/chesscom';
import { pgnToSummary } from '../ingest/pgnToSummary';
import { upsertSummaries, loadSummaries } from '../summaries/store';
import {
  createSession,
  getProgress,
  updateProgress,
  completeSession,
  errorSession,
  subscribeToProgress,
  isAnalyzing,
  type AnalysisProgress,
} from '../analysis/sessionManager';

const StartAnalysisQuery = z.object({
  username: z.string().min(1),
  userId: z.string().min(1),
  limitGames: z.coerce.number().int().min(1).max(500).default(500),
});

const StatusQuery = z.object({
  userId: z.string().min(1),
});

export default async function analyzeStreamRoutes(app: FastifyInstance) {
  /**
   * Start analysis and stream progress via SSE
   *
   * GET /analyze/stream?username=xxx&userId=xxx&limitGames=500
   *
   * Returns Server-Sent Events with progress updates
   */
  app.get('/analyze/stream', async (req, reply) => {
    const parse = StartAnalysisQuery.safeParse((req as any).query);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parse.error.flatten() });
    }

    const { username, userId, limitGames } = parse.data;

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Helper to send SSE event
    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Check if analysis is already running
    if (isAnalyzing(userId)) {
      const progress = getProgress(userId);
      sendEvent('already_running', progress);

      // Subscribe to existing session
      const unsubscribe = subscribeToProgress(userId, (progress) => {
        sendEvent('progress', progress);
        if (progress.status === 'complete') {
          sendEvent('complete', progress);
          reply.raw.end();
        }
      });

      req.raw.on('close', unsubscribe);
      return;
    }

    try {
      // Fetch archives and count games
      sendEvent('status', { message: 'Fetching game archives...' });
      const archives = await listArchives(username);

      // Collect all PGNs (up to limit)
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

      const totalGames = allPgns.length;
      sendEvent('games_found', { totalGames, username });

      // Create analysis session
      const session = createSession(userId, totalGames);
      updateProgress(userId, { status: 'analyzing' });

      // Subscribe to progress updates and forward to SSE
      const unsubscribe = subscribeToProgress(userId, (progress) => {
        sendEvent('progress', progress);
      });

      // Handle client disconnect
      req.raw.on('close', () => {
        unsubscribe();
        app.log.info(`[SSE] Client disconnected for ${userId}`);
      });

      // Process games in parallel batches with incremental saves
      const BATCH_SIZE = 8;
      let processed = 0;
      let batchNum = 0;

      for (let i = 0; i < allPgns.length; i += BATCH_SIZE) {
        // Check if aborted
        if (session.abortController.signal.aborted) {
          sendEvent('cancelled', { message: 'Analysis cancelled' });
          reply.raw.end();
          return;
        }

        const batch = allPgns.slice(i, i + BATCH_SIZE);
        batchNum++;

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map((pgn) => pgnToSummary(pgn, username))
        );

        // Save valid summaries immediately (incremental save)
        const validSummaries = batchResults.filter(Boolean) as any[];
        if (validSummaries.length > 0) {
          await upsertSummaries(userId, validSummaries);
        }

        processed += batch.length;

        // Update progress
        updateProgress(userId, {
          gamesAnalyzed: processed,
          gamesRemaining: totalGames - processed,
          currentBatch: batchNum,
        });
      }

      // Mark complete
      completeSession(userId);
      const finalProgress = getProgress(userId);
      sendEvent('complete', finalProgress);

      // Load final count
      const allSummaries = await loadSummaries(userId);
      sendEvent('summary', {
        totalGamesAnalyzed: allSummaries.length,
        userId,
      });

      reply.raw.end();
    } catch (err: any) {
      app.log.error('[SSE] Analysis error:', err);
      errorSession(userId, err.message || 'Unknown error');
      sendEvent('error', { error: err.message || 'Analysis failed' });
      reply.raw.end();
    }
  });

  /**
   * Get current analysis status (non-streaming)
   *
   * GET /analyze/status?userId=xxx
   */
  app.get('/analyze/status', async (req, reply) => {
    const parse = StatusQuery.safeParse((req as any).query);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parse.error.flatten() });
    }

    const { userId } = parse.data;

    // Get active session progress
    const progress = getProgress(userId);

    if (progress) {
      return reply.send(progress);
    }

    // No active session - check if we have stored summaries
    const summaries = await loadSummaries(userId);

    return reply.send({
      userId,
      status: summaries.length > 0 ? 'complete' : 'not_started',
      totalGames: summaries.length,
      gamesAnalyzed: summaries.length,
      gamesRemaining: 0,
      percentComplete: summaries.length > 0 ? 100 : 0,
      estimatedSecondsRemaining: 0,
      message: summaries.length > 0
        ? `${summaries.length} games previously analyzed`
        : 'No analysis data found. Start analysis to begin.',
    });
  });

  /**
   * Subscribe to progress updates for an ongoing analysis (SSE)
   *
   * GET /analyze/progress?userId=xxx
   */
  app.get('/analyze/progress', async (req, reply) => {
    const parse = StatusQuery.safeParse((req as any).query);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parse.error.flatten() });
    }

    const { userId } = parse.data;

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send current progress immediately
    const progress = getProgress(userId);
    if (progress) {
      sendEvent('progress', progress);

      if (progress.status === 'complete') {
        sendEvent('complete', progress);
        reply.raw.end();
        return;
      }

      // Subscribe to updates
      const unsubscribe = subscribeToProgress(userId, (progress) => {
        sendEvent('progress', progress);
        if (progress.status === 'complete' || progress.status === 'error') {
          reply.raw.end();
        }
      });

      req.raw.on('close', unsubscribe);
    } else {
      sendEvent('not_found', { message: 'No active analysis session', userId });
      reply.raw.end();
    }
  });
}
