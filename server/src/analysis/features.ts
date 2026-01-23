import { Chess, Square, PieceSymbol, Color } from 'chess.js';
import type { CompactGameSummaryT } from '../summaries/schemas';

/**
 * Rich feature vector for a single position
 * Each position in game history becomes this structured data
 */
export interface PositionFeatures {
  // ===== IDENTITY =====
  gameId: string;
  moveNo: number;
  fen: string;
  
  // ===== MATERIAL =====
  material_balance: number; // centipawns (positive = user ahead)
  material_total: number; // total pieces on board
  has_queens: boolean;
  piece_count_pawns_user: number;
  piece_count_pawns_opp: number;
  piece_count_knights_user: number;
  piece_count_knights_opp: number;
  piece_count_bishops_user: number;
  piece_count_bishops_opp: number;
  piece_count_rooks_user: number;
  piece_count_rooks_opp: number;
  piece_count_queens_user: number;
  piece_count_queens_opp: number;
  
  // ===== PAWN STRUCTURE =====
  doubled_pawns_user: number;
  doubled_pawns_opp: number;
  isolated_pawns_user: number;
  isolated_pawns_opp: number;
  backward_pawns_user: number;
  backward_pawns_opp: number;
  passed_pawns_user: number;
  passed_pawns_opp: number;
  pawn_islands_user: number;
  pawn_islands_opp: number;
  
  // ===== KING SAFETY =====
  king_pawn_shield_user: number; // 0-3 pawns in front of king
  king_pawn_shield_opp: number;
  king_open_files_user: number; // open files near king
  king_open_files_opp: number;
  king_castled_user: boolean;
  king_castled_opp: boolean;
  king_in_center_user: boolean;
  king_in_center_opp: boolean;
  
  // ===== PIECE ACTIVITY =====
  knight_on_outpost_user: boolean;
  knight_on_outpost_opp: boolean;
  bishop_pair_user: boolean;
  bishop_pair_opp: boolean;
  rook_on_open_file_user: number;
  rook_on_open_file_opp: number;
  rook_on_seventh_user: boolean;
  rook_on_seventh_opp: boolean;
  piece_mobility_user: number; // total legal moves
  piece_mobility_opp: number;
  
  // ===== POSITIONAL =====
  center_control_user: number; // control of e4/e5/d4/d5
  center_control_opp: number;
  center_pawn_count_user: number; // pawns on central squares
  center_pawn_count_opp: number;
  space_advantage: number; // user - opp controlled squares
  development_score_user: number; // minor pieces off back rank
  development_score_opp: number;
  
  // ===== TACTICAL =====
  hanging_pieces_user: number; // undefended pieces
  hanging_pieces_opp: number;
  pieces_under_attack_user: number;
  pieces_under_attack_opp: number;
  checks_available_user: number;
  checks_available_opp: number;
  in_check: boolean;
  can_capture_queen: boolean;
  
  // ===== MOVE QUALITY =====
  eval_before_cp: number;
  eval_after_cp: number;
  eval_swing_cp: number; // negative = user's position got worse
  move_accuracy: number; // 0-1 (1 = perfect)
  was_best_move: boolean;
  was_blunder: boolean; // swing < -200cp
  was_mistake: boolean; // swing < -100cp
  was_inaccuracy: boolean; // swing < -50cp
  
  // ===== GAME CONTEXT =====
  time_control: 'bullet' | 'blitz' | 'rapid' | 'daily';
  game_phase: 'opening' | 'middlegame' | 'endgame';
  user_color: 'white' | 'black';
  user_rating: number;
  opponent_rating: number;
  rating_diff: number; // user - opponent
  opening_eco: string | null;
  opening_name: string | null;
  game_result: 'win' | 'loss' | 'draw' | 'other';
  move_side: 'user' | 'opponent'; // whose move this was
}

/**
 * Extract features from all positions across all games
 */
export function extractAllFeatures(
  summaries: CompactGameSummaryT[]
): PositionFeatures[] {
  const features: PositionFeatures[] = [];
  
  for (const game of summaries) {
    for (const kp of game.keyPositions) {
      try {
        const posFeatures = extractPositionFeatures(game, kp);
        features.push(posFeatures);
      } catch (error) {
        console.error(`Failed to extract features for game ${game.gameId} move ${kp.moveNo}:`, error);
      }
    }
  }
  
  return features;
}

/**
 * Extract features for a single position
 */
function extractPositionFeatures(
  game: CompactGameSummaryT,
  position: CompactGameSummaryT['keyPositions'][0]
): PositionFeatures {
  const chess = new Chess(position.fen);
  const userColor = game.userColor === 'white' ? 'w' : 'b';
  const oppColor = userColor === 'w' ? 'b' : 'w';
  
  // Determine whose move this was
  const moveSide = position.side === 'W' 
    ? (game.userColor === 'white' ? 'user' : 'opponent')
    : (game.userColor === 'black' ? 'user' : 'opponent');
  
  // Extract all feature categories
  const material = calculateMaterial(chess, userColor, oppColor);
  const pawnStructure = analyzePawnStructure(chess, userColor, oppColor);
  const kingSafety = analyzeKingSafety(chess, userColor, oppColor);
  const pieceActivity = analyzePieceActivity(chess, userColor, oppColor);
  const positional = analyzePositionalFactors(chess, userColor, oppColor);
  const tactical = analyzeTactical(chess, userColor, oppColor);
  
  // Move quality analysis
  const evalBefore = position.evalBefore ?? 0;
  const evalAfter = position.evalAfter ?? 0;
  
  // Adjust eval swing based on side to move and user color
  let evalSwing = evalAfter - evalBefore;
  if (moveSide === 'opponent') {
    evalSwing = -evalSwing; // Flip if opponent moved (their good move = bad for user)
  }
  
  const evalSwingCp = Math.round(evalSwing * 100);
  
  return {
    gameId: game.gameId,
    moveNo: position.moveNo,
    fen: position.fen,
    
    ...material,
    ...pawnStructure,
    ...kingSafety,
    ...pieceActivity,
    ...positional,
    ...tactical,
    
    eval_before_cp: Math.round(evalBefore * 100),
    eval_after_cp: Math.round(evalAfter * 100),
    eval_swing_cp: evalSwingCp,
    move_accuracy: calculateAccuracy(evalSwingCp),
    was_best_move: position.move === position.bestMove,
    was_blunder: evalSwingCp < -200,
    was_mistake: evalSwingCp < -100 && evalSwingCp >= -200,
    was_inaccuracy: evalSwingCp < -50 && evalSwingCp >= -100,
    
    time_control: game.timeControl.type,
    game_phase: determinePhase(position.moveNo, material.material_total),
    user_color: game.userColor,
    user_rating: game.userRating ?? 1200,
    opponent_rating: game.oppRating ?? 1200,
    rating_diff: (game.userRating ?? 1200) - (game.oppRating ?? 1200),
    opening_eco: game.opening.eco,
    opening_name: game.opening.name,
    game_result: normalizeResult(game.result),
    move_side: moveSide,
  };
}

// ===== FEATURE EXTRACTION HELPERS =====

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0
};

function calculateMaterial(chess: Chess, userColor: Color, oppColor: Color) {
  const board = chess.board();
  let userMaterial = 0;
  let oppMaterial = 0;
  const counts = {
    user: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    opp: { p: 0, n: 0, b: 0, r: 0, q: 0 }
  };
  
  for (const row of board) {
    for (const square of row) {
      if (square) {
        const value = PIECE_VALUES[square.type];
        if (square.color === userColor) {
          userMaterial += value;
          if (square.type !== 'k') counts.user[square.type]++;
        } else {
          oppMaterial += value;
          if (square.type !== 'k') counts.opp[square.type]++;
        }
      }
    }
  }
  
  return {
    material_balance: userMaterial - oppMaterial,
    material_total: (userMaterial + oppMaterial) / 100, // Normalize to ~30
    has_queens: counts.user.q > 0 || counts.opp.q > 0,
    piece_count_pawns_user: counts.user.p,
    piece_count_pawns_opp: counts.opp.p,
    piece_count_knights_user: counts.user.n,
    piece_count_knights_opp: counts.opp.n,
    piece_count_bishops_user: counts.user.b,
    piece_count_bishops_opp: counts.opp.b,
    piece_count_rooks_user: counts.user.r,
    piece_count_rooks_opp: counts.opp.r,
    piece_count_queens_user: counts.user.q,
    piece_count_queens_opp: counts.opp.q,
  };
}

function analyzePawnStructure(chess: Chess, userColor: Color, oppColor: Color) {
  const board = chess.board();
  const files = 'abcdefgh';
  
  // Get pawn positions for each side
  const userPawns: Square[] = [];
  const oppPawns: Square[] = [];
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = board[rank][file];
      if (square?.type === 'p') {
        const sq = (files[file] + (8 - rank)) as Square;
        if (square.color === userColor) {
          userPawns.push(sq);
        } else {
          oppPawns.push(sq);
        }
      }
    }
  }
  
  const userStats = analyzePawnStats(userPawns, userColor);
  const oppStats = analyzePawnStats(oppPawns, oppColor);
  
  return {
    doubled_pawns_user: userStats.doubled,
    doubled_pawns_opp: oppStats.doubled,
    isolated_pawns_user: userStats.isolated,
    isolated_pawns_opp: oppStats.isolated,
    backward_pawns_user: userStats.backward,
    backward_pawns_opp: oppStats.backward,
    passed_pawns_user: userStats.passed,
    passed_pawns_opp: oppStats.passed,
    pawn_islands_user: userStats.islands,
    pawn_islands_opp: oppStats.islands,
  };
}

function analyzePawnStats(pawns: Square[], color: Color) {
  const files = 'abcdefgh';
  const fileMap = new Map<string, number[]>();
  
  // Group pawns by file
  for (const pawn of pawns) {
    const file = pawn[0];
    const rank = parseInt(pawn[1]);
    if (!fileMap.has(file)) fileMap.set(file, []);
    fileMap.get(file)!.push(rank);
  }
  
  // Count doubled pawns
  let doubled = 0;
  for (const ranks of fileMap.values()) {
    if (ranks.length > 1) doubled += ranks.length - 1;
  }
  
  // Count isolated pawns (no friendly pawns on adjacent files)
  let isolated = 0;
  for (const [file] of fileMap) {
    const fileIdx = files.indexOf(file);
    const leftFile = files[fileIdx - 1];
    const rightFile = files[fileIdx + 1];
    const hasNeighbor = (leftFile && fileMap.has(leftFile)) || (rightFile && fileMap.has(rightFile));
    if (!hasNeighbor) isolated += fileMap.get(file)!.length;
  }
  
  // Simplified backward/passed pawn detection
  const backward = 0; // TODO: Implement proper backward pawn detection
  const passed = 0; // TODO: Implement proper passed pawn detection
  
  // Count pawn islands (groups of connected pawns)
  let islands = 0;
  let inIsland = false;
  for (const file of files) {
    if (fileMap.has(file)) {
      if (!inIsland) {
        islands++;
        inIsland = true;
      }
    } else {
      inIsland = false;
    }
  }
  
  return { doubled, isolated, backward, passed, islands };
}

function analyzeKingSafety(chess: Chess, userColor: Color, oppColor: Color) {
  const board = chess.board();
  const files = 'abcdefgh';
  
  // Find king positions
  let userKingSquare: Square | null = null;
  let oppKingSquare: Square | null = null;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = board[rank][file];
      if (square?.type === 'k') {
        const sq = (files[file] + (8 - rank)) as Square;
        if (square.color === userColor) {
          userKingSquare = sq;
        } else {
          oppKingSquare = sq;
        }
      }
    }
  }
  
  const userStats = userKingSquare ? analyzeKingStats(userKingSquare, board, userColor) : {
    pawnShield: 0, openFiles: 0, castled: false, inCenter: false
  };
  
  const oppStats = oppKingSquare ? analyzeKingStats(oppKingSquare, board, oppColor) : {
    pawnShield: 0, openFiles: 0, castled: false, inCenter: false
  };
  
  return {
    king_pawn_shield_user: userStats.pawnShield,
    king_pawn_shield_opp: oppStats.pawnShield,
    king_open_files_user: userStats.openFiles,
    king_open_files_opp: oppStats.openFiles,
    king_castled_user: userStats.castled,
    king_castled_opp: oppStats.castled,
    king_in_center_user: userStats.inCenter,
    king_in_center_opp: oppStats.inCenter,
  };
}

function analyzeKingStats(kingSquare: Square, board: any[][], color: Color) {
  const files = 'abcdefgh';
  const file = kingSquare[0];
  const rank = parseInt(kingSquare[1]);
  const fileIdx = files.indexOf(file);
  
  // Count pawns in front of king (pawn shield)
  let pawnShield = 0;
  const shieldRanks = color === 'w' ? [rank + 1, rank + 2] : [rank - 1, rank - 2];
  const shieldFiles = [fileIdx - 1, fileIdx, fileIdx + 1].filter(f => f >= 0 && f < 8);
  
  for (const shieldRank of shieldRanks) {
    if (shieldRank < 1 || shieldRank > 8) continue;
    for (const shieldFile of shieldFiles) {
      const boardRank = 8 - shieldRank;
      const piece = board[boardRank]?.[shieldFile];
      if (piece?.type === 'p' && piece.color === color) {
        pawnShield++;
      }
    }
  }
  
  // Castling detection (king on g/c file and not center)
  const castled = (file === 'g' || file === 'c') && (rank === 1 || rank === 8);
  
  // King in center (e/d file, ranks 1-4 for white, 5-8 for black)
  const inCenter = (file === 'e' || file === 'd') && 
    (color === 'w' ? rank <= 4 : rank >= 5);
  
  // Open files near king (simplified)
  const openFiles = 0; // TODO: Implement proper open file detection
  
  return { pawnShield, openFiles, castled, inCenter };
}

function analyzePieceActivity(chess: Chess, userColor: Color, oppColor: Color) {
  const board = chess.board();
  const files = 'abcdefgh';
  
  // Count legal moves for each side (mobility)
  const originalTurn = chess.turn();
  let userMobility = 0;
  let oppMobility = 0;
  
  // User mobility
  if (chess.turn() === userColor) {
    userMobility = chess.moves().length;
  } else {
    // Can't easily calculate opposite side mobility without making a null move
    // Simplified: use current side's mobility
    oppMobility = chess.moves().length;
  }
  
  // Find special piece positions
  let knightOutpostUser = false;
  let knightOutpostOpp = false;
  let bishopPairUser = false;
  let bishopPairOpp = false;
  let rookOpenFileUser = 0;
  let rookOpenFileOpp = 0;
  let rookSeventhUser = false;
  let rookSeventhOpp = false;
  
  let userBishops = 0;
  let oppBishops = 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = board[rank][file];
      if (!square) continue;
      
      const sq = (files[file] + (8 - rank)) as Square;
      
      // Count bishops for bishop pair
      if (square.type === 'b') {
        if (square.color === userColor) userBishops++;
        else oppBishops++;
      }
      
      // Check for rooks on 7th rank
      if (square.type === 'r') {
        if (square.color === userColor) {
          if ((userColor === 'w' && rank === 1) || (userColor === 'b' && rank === 6)) {
            rookSeventhUser = true;
          }
        } else {
          if ((oppColor === 'w' && rank === 1) || (oppColor === 'b' && rank === 6)) {
            rookSeventhOpp = true;
          }
        }
      }
    }
  }
  
  bishopPairUser = userBishops >= 2;
  bishopPairOpp = oppBishops >= 2;
  
  return {
    knight_on_outpost_user: knightOutpostUser,
    knight_on_outpost_opp: knightOutpostOpp,
    bishop_pair_user: bishopPairUser,
    bishop_pair_opp: bishopPairOpp,
    rook_on_open_file_user: rookOpenFileUser,
    rook_on_open_file_opp: rookOpenFileOpp,
    rook_on_seventh_user: rookSeventhUser,
    rook_on_seventh_opp: rookSeventhOpp,
    piece_mobility_user: userMobility,
    piece_mobility_opp: oppMobility,
  };
}

function analyzePositionalFactors(chess: Chess, userColor: Color, oppColor: Color) {
  const board = chess.board();
  const files = 'abcdefgh';
  
  // Center squares: e4, e5, d4, d5
  const centerSquares = [
    { file: 4, rank: 4 }, // e4
    { file: 4, rank: 3 }, // e5
    { file: 3, rank: 4 }, // d4
    { file: 3, rank: 3 }, // d5
  ];
  
  let centerPawnsUser = 0;
  let centerPawnsOpp = 0;
  let centerControlUser = 0;
  let centerControlOpp = 0;
  
  for (const center of centerSquares) {
    const piece = board[center.rank][center.file];
    if (piece?.type === 'p') {
      if (piece.color === userColor) centerPawnsUser++;
      else centerPawnsOpp++;
    }
    
    // Simplified center control (just check if piece present)
    if (piece) {
      if (piece.color === userColor) centerControlUser++;
      else centerControlOpp++;
    }
  }
  
  const spaceAdvantage = centerControlUser - centerControlOpp;
  
  // Development score (simplified: count minor pieces off back rank)
  let devUser = 0;
  let devOpp = 0;
  const backRankUser = userColor === 'w' ? 7 : 0;
  const backRankOpp = oppColor === 'w' ? 7 : 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = board[rank][file];
      if (square && (square.type === 'n' || square.type === 'b')) {
        if (square.color === userColor && rank !== backRankUser) devUser++;
        if (square.color === oppColor && rank !== backRankOpp) devOpp++;
      }
    }
  }
  
  return {
    center_control_user: centerControlUser,
    center_control_opp: centerControlOpp,
    center_pawn_count_user: centerPawnsUser,
    center_pawn_count_opp: centerPawnsOpp,
    space_advantage: spaceAdvantage,
    development_score_user: devUser,
    development_score_opp: devOpp,
  };
}

function analyzeTactical(chess: Chess, userColor: Color, oppColor: Color) {
  // Simplified tactical analysis
  const inCheck = chess.inCheck();
  
  // Count available checks
  const moves = chess.moves({ verbose: true });
  let checksAvailableUser = 0;
  let checksAvailableOpp = 0;
  
  if (chess.turn() === userColor) {
    checksAvailableUser = moves.filter(m => m.san.includes('+')).length;
  } else {
    checksAvailableOpp = moves.filter(m => m.san.includes('+')).length;
  }
  
  // Check if can capture queen
  const canCaptureQueen = moves.some(m => m.captured === 'q');
  
  // Hanging pieces detection (simplified: pieces that can be captured)
  let hangingPiecesUser = 0;
  let hangingPiecesOpp = 0;
  let piecesUnderAttackUser = 0;
  let piecesUnderAttackOpp = 0;
  
  // TODO: Implement proper hanging piece detection
  // This requires checking if pieces are defended vs attacked
  
  return {
    hanging_pieces_user: hangingPiecesUser,
    hanging_pieces_opp: hangingPiecesOpp,
    pieces_under_attack_user: piecesUnderAttackUser,
    pieces_under_attack_opp: piecesUnderAttackOpp,
    checks_available_user: checksAvailableUser,
    checks_available_opp: checksAvailableOpp,
    in_check: inCheck,
    can_capture_queen: canCaptureQueen,
  };
}

function calculateAccuracy(evalSwingCp: number): number {
  // Map eval swing to accuracy score (0-1)
  // Perfect move = 0 swing = 1.0 accuracy
  // -300cp swing = 0.0 accuracy
  const maxSwing = 300;
  return Math.max(0, 1 - Math.abs(evalSwingCp) / maxSwing);
}

function determinePhase(moveNo: number, materialTotal: number): 'opening' | 'middlegame' | 'endgame' {
  if (moveNo <= 10) return 'opening';
  if (materialTotal < 20) return 'endgame';
  return 'middlegame';
}

function normalizeResult(result: CompactGameSummaryT['result']): 'win' | 'loss' | 'draw' | 'other' {
  if (result === 'win') return 'win';
  if (result === 'loss') return 'loss';
  if (result === 'draw' || result === 'stalemate') return 'draw';
  return 'other';
}

