import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import WK from '../../../assets/pieces/cburnett/wK.svg';
import WQ from '../../../assets/pieces/cburnett/wQ.svg';
import WR from '../../../assets/pieces/cburnett/wR.svg';
import WB from '../../../assets/pieces/cburnett/wB.svg';
import WN from '../../../assets/pieces/cburnett/wN.svg';
import WP from '../../../assets/pieces/cburnett/wP.svg';
import BK from '../../../assets/pieces/cburnett/bK.svg';
import BQ from '../../../assets/pieces/cburnett/bQ.svg';
import BR from '../../../assets/pieces/cburnett/bR.svg';
import BB from '../../../assets/pieces/cburnett/bB.svg';
import BN from '../../../assets/pieces/cburnett/bN.svg';
import BP from '../../../assets/pieces/cburnett/bP.svg';

type BoardProps = {
  fen: string;
  size?: number; // total board size in px
  lightColor?: string;
  darkColor?: string;
};

const pieceToSvg: Record<string, React.FC<any>> = {
  K: WK, Q: WQ, R: WR, B: WB, N: WN, P: WP,
  k: BK, q: BQ, r: BR, b: BB, n: BN, p: BP,
};

export const Board: React.FC<BoardProps> = ({ fen, size = 224, lightColor = '#f0d9b5', darkColor = '#b58863' }) => {
  const grid = parseFenBoard(fen);
  if (!grid) return null;
  const square = size / 8;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {Array.from({ length: 8 }).map((_, r) =>
          Array.from({ length: 8 }).map((_, c) => (
            <Rect
              key={`sq-${r}-${c}`}
              x={c * square}
              y={r * square}
              width={square}
              height={square}
              fill={(r + c) % 2 === 1 ? darkColor : lightColor}
            />
          )),
        )}
      </Svg>
      {/* Piece layer */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }} pointerEvents="none">
        {grid.map((row, r) => (
          <View key={`pr-${r}`} style={{ flexDirection: 'row' }}>
            {row.map((cell, c) => (
              <View
                key={`pc-${r}-${c}`}
                style={{ width: square, height: square, alignItems: 'center', justifyContent: 'center' }}
              >
                {!!cell && renderPiece(cell, square * 0.8)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

function renderPiece(symbol: string, size: number) {
  const Comp = pieceToSvg[symbol];
  if (!Comp) return null;
  return <Comp width={size} height={size} />;
}

function parseFenBoard(fen: string): (string | null)[][] | null {
  const parts = fen.split(' ');
  if (parts.length < 1) return null;
  const rows = parts[0].split('/');
  if (rows.length !== 8) return null;
  const board: (string | null)[][] = [];
  for (let r = 0; r < 8; r++) {
    const row = rows[r];
    const cells: (string | null)[] = [];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (/[1-8]/.test(ch)) {
        const n = parseInt(ch, 10);
        for (let k = 0; k < n; k++) cells.push(null);
      } else if (/[prnbqkPRNBQK]/.test(ch)) {
        cells.push(ch);
      } else {
        return null;
      }
    }
    if (cells.length !== 8) return null;
    board.push(cells);
  }
  return board;
}

export default Board;


