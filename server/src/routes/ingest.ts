import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listArchives, fetchArchive } from '../ingest/chesscom';
import { pgnToSummary } from '../ingest/pgnToSummary';
import { upsertSummaries, loadSummaries } from '../summaries/store';

const Query = z.object({
  username: z.string().min(1),
  userId: z.string().min(1),
  limitMonths: z.coerce.number().int().min(1).max(12).default(3),
});

export default async function ingestRoutes(app: FastifyInstance) {
  app.get('/ingest/chesscom', async (req, reply) => {
    const parse = Query.safeParse((req as any).query);
    if (!parse.success) return reply.code(400).send({ error: 'Invalid query', details: parse.error.flatten() });
    const { username, userId, limitMonths } = parse.data;

    try {
      const archives = (await listArchives(username)).slice(0, limitMonths);
      let added = 0;
      const summaries: any[] = [];
      for (const url of archives) {
        const raw = await fetchArchive(url);
        const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);
        for (const pgn of games) {
          const sum = pgnToSummary(pgn, username);
          if (sum) {
            summaries.push(sum);
            added++;
          }
        }
      }
      if (summaries.length > 0) await upsertSummaries(userId, summaries);
      const total = (await loadSummaries(userId)).length;
      return reply.send({ userId, added, total });
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ error: 'Ingest failed' });
    }
  });
}


