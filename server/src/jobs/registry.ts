import { nanoid } from 'nanoid';

export type JobState = {
  id: string;
  tokens: string[];
  done: boolean;
  createdAt: number;
};

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

const idToJob = new Map<string, JobState>();

function pruneOldJobs(nowMs: number) {
  for (const [id, job] of idToJob.entries()) {
    if (nowMs - job.createdAt > THIRTY_MINUTES_MS) {
      idToJob.delete(id);
    }
  }
}

export function createJob(): JobState {
  const now = Date.now();
  pruneOldJobs(now);
  const id = nanoid();
  const job: JobState = { id, tokens: [], done: false, createdAt: now };
  idToJob.set(id, job);
  return job;
}

export function appendTokens(id: string, toks: string[]): void {
  const job = idToJob.get(id);
  if (!job || job.done) return;
  if (toks.length === 0) return;
  job.tokens.push(...toks);
}

export function markDone(id: string): void {
  const job = idToJob.get(id);
  if (!job) return;
  job.done = true;
}

export function readFrom(id: string, cursor: number): { tokens: string[]; nextCursor: number; done: boolean } {
  const job = idToJob.get(id);
  if (!job) {
    // Unknown job: behave as done with no tokens
    return { tokens: [], nextCursor: cursor, done: true };
  }
  const start = Math.max(0, Math.min(cursor, job.tokens.length));
  const slice = job.tokens.slice(start);
  const nextCursor = start + slice.length;
  return { tokens: slice, nextCursor, done: job.done };
}


