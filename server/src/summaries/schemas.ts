import { z } from 'zod';

export const KeyPosition = z.object({
  moveNo: z.number(),
  side: z.enum(["W", "B"]),
  fen: z.string(),
  tag: z.array(z.string()).default([]),
  evalBefore: z.number().nullable().default(null),
  evalAfter: z.number().nullable().default(null),
  bestMove: z.string().nullable().default(null),
});

export const CompactGameSummary = z.object({
  gameId: z.string(),
  date: z.string(),
  site: z.literal("chess.com"),
  rated: z.boolean().default(true),
  variant: z.literal("standard").default("standard"),
  timeControl: z.object({
    type: z.enum(["bullet", "blitz", "rapid", "daily"]),
    base: z.number().nullable(),
    increment: z.number().nullable(),
  }),
  userColor: z.enum(["white", "black"]),
  userRating: z.number().nullable().default(null),
  oppRating: z.number().nullable().default(null),
  result: z.enum(["win", "loss", "draw", "abort", "timeout", "resign", "checkmate", "stalemate", "other"]).default("other"),
  opening: z.object({ eco: z.string().nullable(), name: z.string().nullable() }).default({ eco: null, name: null }),
  mistakes: z.number().default(0),
  blunders: z.number().default(0),
  inaccuracies: z.number().default(0),
  keyPositions: z.array(KeyPosition).max(4).default([]),
});

export type CompactGameSummaryT = z.infer<typeof CompactGameSummary>;


