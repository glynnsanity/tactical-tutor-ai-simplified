import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readFrom } from '../jobs/registry';

const PollQuery = z.object({
  jobId: z.string().min(1),
  cursor: z.union([z.string(), z.number()]).optional(),
});

export default async function pollRoutes(app: FastifyInstance) {
  app.get('/poll', async (req, reply) => {
    const parse = PollQuery.safeParse((req as any).query);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parse.error.flatten() });
    }
    const { jobId, cursor } = parse.data;
    const cur = Number(cursor ?? 0);
    if (!Number.isFinite(cur) || cur < 0) {
      return reply.code(400).send({ error: 'Invalid cursor' });
    }

    const { tokens, nextCursor, done } = readFrom(jobId, cur);
    // If jobId unknown and no tokens, treat as 404 for clarity
    if (cur === 0 && tokens.length === 0 && done) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return reply.send({ tokens, nextCursor, done });
  });
}


