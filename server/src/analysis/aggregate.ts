import { type CompactGameSummaryT } from '../summaries/schemas';

export type AggregateView = {
  totals: { games: number; wins: number; losses: number; draws: number };
  byTimeControl: Array<{ type: 'bullet' | 'blitz' | 'rapid' | 'daily'; games: number; score: number }>;
  byOpening: Array<{ eco: string | null; name: string | null; games: number; score: number }>;
  examples: Array<{ gameId: string; moveNo: number; fen: string; tag: string[] }>;
};

export function buildAggregate(
  summaries: CompactGameSummaryT[],
  opts?: { maxOpenings?: number; maxExamples?: number },
): AggregateView {
  const maxOpenings = opts?.maxOpenings ?? 5;
  const maxExamples = opts?.maxExamples ?? 3;

  const totals = { games: 0, wins: 0, losses: 0, draws: 0 };
  const byTc = new Map<'bullet' | 'blitz' | 'rapid' | 'daily', { games: number; wins: number; draws: number }>();
  const byOp = new Map<string, { eco: string | null; name: string | null; games: number; wins: number; draws: number }>();

  const fenSeen = new Set<string>();
  const exampleLosses: AggregateView['examples'] = [];
  const exampleOthers: AggregateView['examples'] = [];

  for (const g of summaries) {
    totals.games += 1;
    const outcome = normalizeOutcome(g.result);
    if (outcome === 'win') totals.wins += 1;
    else if (outcome === 'loss') totals.losses += 1;
    else if (outcome === 'draw') totals.draws += 1;

    const tcKey = g.timeControl.type;
    const tcEntry = byTc.get(tcKey) ?? { games: 0, wins: 0, draws: 0 };
    tcEntry.games += 1;
    if (outcome === 'win') tcEntry.wins += 1;
    if (outcome === 'draw') tcEntry.draws += 1;
    byTc.set(tcKey, tcEntry);

    const opKey = `${g.opening.eco ?? 'NA'}|${g.opening.name ?? 'Unknown'}`;
    const opEntry = byOp.get(opKey) ?? { eco: g.opening.eco ?? null, name: g.opening.name ?? null, games: 0, wins: 0, draws: 0 };
    opEntry.games += 1;
    if (outcome === 'win') opEntry.wins += 1;
    if (outcome === 'draw') opEntry.draws += 1;
    byOp.set(opKey, opEntry);

    // Collect example positions, prefer from losses and dedup by FEN
    const pool = outcome === 'loss' ? exampleLosses : exampleOthers;
    for (const kp of g.keyPositions) {
      if (!fenSeen.has(kp.fen)) {
        pool.push({ gameId: g.gameId, moveNo: kp.moveNo, fen: kp.fen, tag: kp.tag });
        fenSeen.add(kp.fen);
        if (pool.length >= maxExamples) break;
      }
    }
  }

  const byTimeControl = Array.from(byTc.entries()).map(([type, v]) => ({ type, games: v.games, score: score(v.wins, v.draws, v.games) }));
  const byOpening = Array.from(byOp.values())
    .sort((a, b) => b.games - a.games)
    .slice(0, maxOpenings)
    .map((v) => ({ eco: v.eco, name: v.name, games: v.games, score: score(v.wins, v.draws, v.games) }));

  const examples: AggregateView['examples'] = [];
  for (const e of exampleLosses) {
    if (examples.length < maxExamples) examples.push(e);
  }
  for (const e of exampleOthers) {
    if (examples.length < maxExamples) examples.push(e);
  }

  return { totals, byTimeControl, byOpening, examples };
}

function score(wins: number, draws: number, games: number): number {
  if (games <= 0) return 0;
  return (wins + 0.5 * draws) / games;
}

function normalizeOutcome(result: CompactGameSummaryT['result']): 'win' | 'loss' | 'draw' | 'other' {
  if (result === 'win') return 'win';
  if (result === 'loss') return 'loss';
  if (result === 'draw') return 'draw';
  return 'other';
}


