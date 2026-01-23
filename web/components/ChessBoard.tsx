'use client'

import React from 'react'

type BoardProps = {
  fen: string
  size?: number
  lightColor?: string
  darkColor?: string
}

// Using Lichess piece images (free CDN)
const PIECE_BASE_URL = 'https://lichess1.org/assets/piece/cburnett'

const pieceToUrl: Record<string, string> = {
  K: `${PIECE_BASE_URL}/wK.svg`,
  Q: `${PIECE_BASE_URL}/wQ.svg`,
  R: `${PIECE_BASE_URL}/wR.svg`,
  B: `${PIECE_BASE_URL}/wB.svg`,
  N: `${PIECE_BASE_URL}/wN.svg`,
  P: `${PIECE_BASE_URL}/wP.svg`,
  k: `${PIECE_BASE_URL}/bK.svg`,
  q: `${PIECE_BASE_URL}/bQ.svg`,
  r: `${PIECE_BASE_URL}/bR.svg`,
  b: `${PIECE_BASE_URL}/bB.svg`,
  n: `${PIECE_BASE_URL}/bN.svg`,
  p: `${PIECE_BASE_URL}/bP.svg`,
}

export function ChessBoard({
  fen,
  size = 280,
  lightColor = '#f0d9b5',
  darkColor = '#b58863',
}: BoardProps) {
  const grid = parseFenBoard(fen)
  if (!grid) return null

  const squareSize = size / 8

  return (
    <div
      className="relative inline-block rounded overflow-hidden shadow-md"
      style={{ width: size, height: size }}
    >
      {/* Board squares */}
      <svg width={size} height={size}>
        {Array.from({ length: 8 }).map((_, r) =>
          Array.from({ length: 8 }).map((_, c) => (
            <rect
              key={`sq-${r}-${c}`}
              x={c * squareSize}
              y={r * squareSize}
              width={squareSize}
              height={squareSize}
              fill={(r + c) % 2 === 1 ? darkColor : lightColor}
            />
          ))
        )}
      </svg>

      {/* Pieces layer */}
      <div className="absolute inset-0 pointer-events-none">
        {grid.map((row, r) => (
          <div key={`row-${r}`} className="flex">
            {row.map((cell, c) => (
              <div
                key={`cell-${r}-${c}`}
                className="flex items-center justify-center"
                style={{ width: squareSize, height: squareSize }}
              >
                {cell && (
                  <img
                    src={pieceToUrl[cell]}
                    alt={cell}
                    style={{ width: squareSize * 0.85, height: squareSize * 0.85 }}
                    draggable={false}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function parseFenBoard(fen: string): (string | null)[][] | null {
  const parts = fen.split(' ')
  if (parts.length < 1) return null
  const rows = parts[0].split('/')
  if (rows.length !== 8) return null

  const board: (string | null)[][] = []
  for (let r = 0; r < 8; r++) {
    const row = rows[r]
    const cells: (string | null)[] = []
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (/[1-8]/.test(ch)) {
        const n = parseInt(ch, 10)
        for (let k = 0; k < n; k++) cells.push(null)
      } else if (/[prnbqkPRNBQK]/.test(ch)) {
        cells.push(ch)
      } else {
        return null
      }
    }
    if (cells.length !== 8) return null
    board.push(cells)
  }
  return board
}

export default ChessBoard
