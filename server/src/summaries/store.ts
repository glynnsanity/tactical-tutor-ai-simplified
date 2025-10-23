import { promises as fs } from 'fs';
import * as path from 'path';
import { CompactGameSummary, type CompactGameSummaryT } from './schemas';

// Persist under the server working directory in ./data
const DATA_ROOT = path.join(process.cwd(), 'data');

function userDir(userId: string) {
  return path.join(DATA_ROOT, userId);
}

function summariesPath(userId: string) {
  return path.join(userDir(userId), 'summaries.json');
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function loadSummaries(userId: string): Promise<CompactGameSummaryT[]> {
  const file = summariesPath(userId);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const parsed = data.map((item) => CompactGameSummary.parse(item));
    return parsed;
  } catch (err: any) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return [];
    throw err;
  }
}

export async function saveSummaries(userId: string, items: CompactGameSummaryT[]): Promise<void> {
  const dir = userDir(userId);
  await ensureDir(dir);
  // Validate before saving
  const valid = items.map((i) => CompactGameSummary.parse(i));
  const file = summariesPath(userId);
  await fs.writeFile(file, JSON.stringify(valid, null, 2), 'utf8');
}

export async function upsertSummaries(userId: string, items: CompactGameSummaryT[]): Promise<void> {
  const existing = await loadSummaries(userId);
  const map = new Map<string, CompactGameSummaryT>();
  for (const it of existing) map.set(it.gameId, it);
  for (const it of items) map.set(it.gameId, CompactGameSummary.parse(it));
  await saveSummaries(userId, Array.from(map.values()));
}


