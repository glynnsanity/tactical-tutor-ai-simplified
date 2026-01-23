import { Chess } from 'chess.js';
import crypto from 'crypto';
import { CompactGameSummary, type CompactGameSummaryT } from '../summaries/schemas';
import { fetchOpeningName } from './chesscom';
import { analyzePosition } from '../services/positionAnalyzer';

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

function mapResultForUser(
  res: string | undefined,
  userColor: 'white' | 'black'
): CompactGameSummaryT['result'] {
  if (!res) return 'other';
  if (res === '1/2-1/2') return 'draw';
  if (res === '1-0') return userColor === 'white' ? 'win' : 'loss';
  if (res === '0-1') return userColor === 'black' ? 'win' : 'loss';
  return 'other';
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

/**
 * Analyze ALL moves in a game with parallel batching
 * Returns evaluations for every position in the game
 */
async function analyzeAllMoves(
  pgn: string,
  options: { batchSize?: number } = {}
): Promise<{ 
  moveNo: number; 
  side: 'W' | 'B'; 
  move: string;
  fen: string; 
  tag: string[]; 
  evalBefore: number | null;
  evalAfter: number | null;
  bestMove: string | null;
}[]> {
  const { batchSize = 20 } = options;
  
  const chess = new Chess();
  chess.loadPgn(pgn, { sloppy: true });
  const history = chess.history({ verbose: true });

  // Collect all positions to analyze
  const positionsToAnalyze: {
    moveNo: number;
    side: 'W' | 'B';
    move: string;
    fenBefore: string;
    fenAfter: string;
    tag: string[];
  }[] = [];

  chess.reset();
  for (const mv of history) {
    const fenBefore = chess.fen();
    chess.move(mv);
    const fullMove = chess.turn() === 'w' ? chess.moveNumber() - 1 : chess.moveNumber();
    const side: 'W' | 'B' = mv.color === 'w' ? 'W' : 'B';
    const fenAfter = chess.fen();

    // Tag special moves
    const tags: string[] = [];
    if (mv.flags?.includes('c')) tags.push('capture');
    if (mv.flags?.includes('+')) tags.push('check');
    if (mv.san.includes('#')) tags.push('checkmate');
    if (mv.flags?.includes('k') || mv.flags?.includes('q')) tags.push('castle');

    positionsToAnalyze.push({
      moveNo: fullMove,
      side,
      move: mv.san,
      fenBefore,
      fenAfter,
      tag: tags
    });
  }

  // Analyze in parallel batches
  const analyzed: {
    moveNo: number;
    side: 'W' | 'B';
    move: string;
    fen: string;
    tag: string[];
    evalBefore: number | null;
    evalAfter: number | null;
    bestMove: string | null;
  }[] = [];

  for (let i = 0; i < positionsToAnalyze.length; i += batchSize) {
    const batch = positionsToAnalyze.slice(i, i + batchSize);
    
    // Analyze each position in the batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (pos) => {
        try {
          // Analyze both before and after positions in parallel
          const [evalBefore, evalAfter] = await Promise.all([
            analyzePosition(pos.fenBefore),
            analyzePosition(pos.fenAfter)
          ]);
          
          return {
            moveNo: pos.moveNo,
            side: pos.side,
            move: pos.move,
            fen: pos.fenAfter,
            tag: pos.tag,
            evalBefore: evalBefore.eval / 100, // Convert centipawns to pawns
            evalAfter: evalAfter.eval / 100,
            bestMove: evalBefore.bestMove || null
          };
        } catch (error) {
          console.error(`Failed to analyze position at move ${pos.moveNo}:`, error);
          return {
            moveNo: pos.moveNo,
            side: pos.side,
            move: pos.move,
            fen: pos.fenAfter,
            tag: pos.tag,
            evalBefore: null,
            evalAfter: null,
            bestMove: null
          };
        }
      })
    );
    
    analyzed.push(...batchResults);
  }

  return analyzed;
}

export async function pgnToSummary(pgn: string, username: string): Promise<CompactGameSummaryT | null> {
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
  
  // Fetch opening name from ECO code if not provided
  const eco = headers.ECO ?? null;
  const openingName = headers.Opening || (await fetchOpeningName(eco));
  const opening = { eco, name: openingName };
  
  const userColor = white === user ? 'white' : 'black';
  const result = mapResultForUser(headers.Result, userColor);

  // Extract player names and Chess.com URL for better game references
  const whitePlayer = headers.White || null;
  const blackPlayer = headers.Black || null;
  const opponent = userColor === 'white' ? blackPlayer : whitePlayer;
  const chesscomUrl = headers.Link || null;

  // Analyze all moves in the game (not just key positions)
  const keyPositions = await analyzeAllMoves(pgn, { batchSize: 20 });

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
    // Enhanced game references
    chesscomUrl,
    whitePlayer,
    blackPlayer,
    opponent,
  });
  return summary;
}


