import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createJob, appendTokens, markDone } from '../jobs/registry';
import { streamAnswer } from '../services/llm';
import { env } from '../services/env';
import { loadSummaries, upsertSummaries } from '../summaries/store';
import { buildAggregate } from '../analysis/aggregate';
import { listArchives, fetchArchive } from '../ingest/chesscom';
import { pgnToSummary } from '../ingest/pgnToSummary';
import { promises as fs } from 'fs';
import * as path from 'path';

const AskBody = z.object({
  question: z.string().min(1).max(2000),
  userId: z.string().optional(),
});

async function buildSystemPromptWithAggregates(userId: string): Promise<string> {
  let summaries = await loadSummaries(userId);
  if (!summaries || summaries.length === 0) {
    await autoIngestIfEmpty(userId, 1, 8000);
    summaries = await loadSummaries(userId);
  }
  if (!summaries || summaries.length === 0) {
    return 'You are a neutral, helpful chess coach. No prior user summaries are available. If asked about personalized advice, suggest running /ingest/chesscom first.';
  }
  const agg = buildAggregate(summaries, { maxOpenings: 5, maxExamples: 3 });
  const aggJson = JSON.stringify(agg);
  return (
    'You are a chess coach. Ground all claims in the provided aggregates and examples. Do not invent stats. ' +
    'Write answers in clear, concise language. ' +
    `Aggregates (JSON): ${aggJson}`
  );
}

async function autoIngestIfEmpty(userId: string, limitMonths = 1, timeoutMs = 8000): Promise<number> {
  // Avoid re-ingesting too often
  const metaPath = path.join(process.cwd(), 'data', userId, '.autoingest.json');
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw) as { lastIngestAt: number };
    if (meta?.lastIngestAt && Date.now() - meta.lastIngestAt < 6 * 60 * 60 * 1000) {
      return 0;
    }
  } catch {}

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const archives = (await listArchives(userId)).slice(0, Math.max(1, limitMonths));
    let added = 0;
    const toSave: any[] = [];
    for (const url of archives) {
      const raw = await fetchArchive(url);
      const games = raw.split(/\n\n(?=\[Event )/).filter(Boolean);
      for (const pgn of games) {
        const s = pgnToSummary(pgn, userId);
        if (s) {
          toSave.push(s);
          added += 1;
        }
        if (controller.signal.aborted) break;
      }
      if (controller.signal.aborted) break;
    }
    if (toSave.length > 0) {
      await upsertSummaries(userId, toSave);
      await fs.mkdir(path.dirname(metaPath), { recursive: true });
      await fs.writeFile(metaPath, JSON.stringify({ lastIngestAt: Date.now() }), 'utf8');
    }
    return added;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

function extractFen(question: string): string | null {
  // Try patterns: fen=... or FEN ...; capture first 6 space-separated fields
  const q = question.trim();
  const fenEq = q.match(/fen=([^\n]+)/i);
  const fenSp = q.match(/\bFEN\s+([^\n]+)/i);
  const candidate = fenEq?.[1] ?? fenSp?.[1] ?? null;
  if (!candidate) return null;
  const parts = candidate.trim().split(/\s+/);
  if (parts.length < 6) return null;
  return parts.slice(0, 6).join(' ');
}

export default async function askRoutes(app: FastifyInstance) {
  app.post('/ask', async (req, reply) => {
    const parse = AskBody.safeParse((req as any).body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parse.error.flatten() });
    }
    const { question, userId: providedUserId } = parse.data;
    const userId = (providedUserId && providedUserId.trim()) || 'demo';

    try {
      const job = createJob();
      const jobId = job.id;
      const system = await buildSystemPromptWithAggregates(userId);
      const user = question.replace(/\s+/g, ' ').trim();
      const fenInQuestion = extractFen(question);
      const allowFenDemo = !env.OPENAI_API_KEY && !!fenInQuestion;

      // Fire-and-forget streaming
      (async () => {
        try {
          await streamAnswer({
            system,
            user,
            onToken: (t: string) => {
              if (!t) return;
              appendTokens(jobId, [t]);
            },
            onDone: () => {
              if (allowFenDemo && fenInQuestion) {
                appendTokens(jobId, [`FEN:${fenInQuestion}`]);
              }
              markDone(jobId);
            },
          });
        } catch (err) {
          // Log details so we can diagnose provider issues (auth, model, quota, etc.)
          try { (app as any).log.error({ err }, 'streamAnswer failed'); } catch {}
          appendTokens(jobId, ['[error: unable to generate answer]']);
          markDone(jobId);
        }
      })();

      return reply.send({ jobId });
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ error: 'Internal error' });
    }
  });
}


