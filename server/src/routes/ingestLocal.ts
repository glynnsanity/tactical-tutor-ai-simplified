import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pgnToSummary } from '../ingest/pgnToSummary';
import { upsertSummaries, loadSummaries } from '../summaries/store';

const Query = z.object({ userId: z.string().min(1) });

export default async function ingestLocalRoutes(app: FastifyInstance) {
  app.post('/ingest/local', async (req, reply) => {
    const parse = Query.safeParse((req as any).query);
    if (!parse.success) return reply.code(400).send({ error: 'Invalid query', details: parse.error.flatten() });
    const { userId } = parse.data;
    const bodyText = (req as any).rawBody || (await getRawText(req));
    if (!bodyText || typeof bodyText !== 'string') return reply.code(400).send({ error: 'Missing PGN text in body' });

    const chunks = bodyText.split(/\n\n(?=\[Event )/).filter(Boolean);
    let added = 0;
    const usernameGuess = 'localuser';
    const summaries: any[] = [];
    for (const pgn of chunks) {
      const s = pgnToSummary(pgn, usernameGuess);
      if (s) {
        summaries.push(s);
        added++;
      }
    }
    if (summaries.length > 0) await upsertSummaries(userId, summaries);
    const total = (await loadSummaries(userId)).length;
    return reply.send({ userId, added, total });
  });
}

async function getRawText(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.raw.setEncoding('utf8');
    req.raw.on('data', (chunk: string) => (data += chunk));
    req.raw.on('end', () => resolve(data));
    req.raw.on('error', reject);
  });
}


