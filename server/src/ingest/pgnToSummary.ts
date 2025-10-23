import { Chess } from 'chess.js';
import crypto from 'crypto';
import { CompactGameSummary, type CompactGameSummaryT } from '../summaries/schemas';

type Headers = Record<string, string>;

export function parsePgnHeaders(pgn: string): Headers {
  const headers: Headers = {};
  const regex = /\[(\w+)\s+"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(pgn))) {
    headers[m[1]] = m[2];
  }
  return headers;
}

function mapResult(res: string | undefined): CompactGameSummaryT['result'] {
  switch (res) {
    case '1-0':
      return 'checkmate';
    case '0-1':
      return 'checkmate';
    case '1/2-1/2':
      return 'draw';
    case 'abandoned':
      return 'abort';
    default:
      return 'other';
  }
}

function toIso(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString();
  // Chess.com date format usually YYYY.MM.DD
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    const [y, m, d] = parts.map((x) => parseInt(x, 10));
    if (y && m && d) return new Date(y, m - 1, d).toISOString();
  }
  return new Date(dateStr).toISOString();
}

function hashId(h: Headers): string {
  const base = [h.Event, h.Date, h.Round, h.White, h.Black, h.Result].join('|');
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 16);
}

function isStandard(headers: Headers): boolean {
  const variant = headers.Variant || headers.VariantType;
  return !variant || /standard/i.test(variant);
}

function parseTimeControl(tc: string | undefined): { type: 'bullet' | 'blitz' | 'rapid' | 'daily'; base: number | null; increment: number | null } {
  // e.g., 600+5 or 1/86400 (daily)
  if (!tc) return { type: 'rapid', base: null, increment: null };
  if (tc.includes('/')) return { type: 'daily', base: null, increment: null };
  const [baseStr, incStr] = tc.split('+');
  const base = Number(baseStr || '0');
  const increment = Number(incStr || '0');
  let type: 'bullet' | 'blitz' | 'rapid' = 'rapid';
  if (base < 180) type = 'bullet';
  else if (base < 600) type = 'blitz';
  else type = 'rapid';
  return { type, base, increment };
}

function pickKeyPositions(pgn: string): { moveNo: number; side: 'W' | 'B'; fen: string; tag: string[] }[] {
  const positions: { moveNo: number; side: 'W' | 'B'; fen: string; tag: string[] }[] = [];
  const chess = new Chess();
  chess.loadPgn(pgn, { sloppy: true });
  const history = chess.history({ verbose: true });
  const seen = new Set<string>();

  chess.reset();
  let moveIndex = 0;
  for (const mv of history) {
    chess.move(mv);
    moveIndex++;
    const fullMove = chess.turn() === 'w' ? chess.moveNumber() - 1 : chess.moveNumber();
    const side: 'W' | 'B' = mv.color === 'w' ? 'W' : 'B';
    const fen = chess.fen();

    // (a) first capture that changes material balance
    if (mv.flags?.includes('c') && !seen.has('material')) {
      positions.push({ moveNo: fullMove, side, fen, tag: ['material_change'] });
      seen.add('material');
    }
    // (b) first check
    if (mv.flags?.includes('+')) {
      if (!seen.has('check')) {
        positions.push({ moveNo: fullMove, side, fen, tag: ['check'] });
        seen.add('check');
      }
    }
    // (c) near mate: if game ended by mate, collect last 1-2 plies
    if (mv.san.includes('#')) {
      positions.push({ moveNo: fullMove, side, fen, tag: ['final_attack'] });
    }
    if (positions.length >= 3) break;
  }
  return positions.slice(0, 3);
}

export function pgnToSummary(pgn: string, username: string): CompactGameSummaryT | null {
  const headers = parsePgnHeaders(pgn);
  if (!isStandard(headers)) return null;
  const rated = /rated/i.test(headers.Event || '') || /rated/i.test(headers.Termination || '');

  const white = (headers.White || '').toLowerCase();
  const black = (headers.Black || '').toLowerCase();
  const user = username.toLowerCase();
  if (white !== user && black !== user) return null;

  const gameId = hashId(headers);
  const date = toIso(headers.Date);
  const tc = parseTimeControl(headers.TimeControl);
  const opening = { eco: headers.ECO ?? null, name: headers.Opening ?? null };
  const userColor = white === user ? 'white' : 'black';
  const result = mapResult(headers.Result);

  const keyPositions = pickKeyPositions(pgn).map((kp) => ({ ...kp, evalBefore: null, evalAfter: null, bestMove: null }));

  const summary: CompactGameSummaryT = CompactGameSummary.parse({
    gameId,
    date,
    site: 'chess.com',
    rated,
    variant: 'standard',
    timeControl: tc,
    userColor,
    userRating: headers.WhiteElo ? Number(headers.WhiteElo) : null,
    oppRating: headers.BlackElo ? Number(headers.BlackElo) : null,
    result,
    opening,
    mistakes: 0,
    blunders: 0,
    inaccuracies: 0,
    keyPositions,
  });
  return summary;
}


