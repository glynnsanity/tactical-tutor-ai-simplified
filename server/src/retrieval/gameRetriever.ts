import type { CompactGameSummaryT } from '../summaries/schemas';

export type RetrievalContext = {
  aggregate: any; // From buildAggregate
  relevantGames?: CompactGameSummaryT[];
  retrievalReason?: string;
};

/**
 * Analyzes the question and retrieves relevant games
 */
export function retrieveRelevantGames(
  question: string,
  allGames: CompactGameSummaryT[],
  maxGames: number = 10
): { games: CompactGameSummaryT[]; reason: string } | null {
  const q = question.toLowerCase();

  // Check for opening mentions
  const openingMatch = detectOpening(q);
  if (openingMatch) {
    const filtered = allGames.filter(g => {
      const name = g.opening.name?.toLowerCase() || '';
      const eco = g.opening.eco?.toLowerCase() || '';
      
      // Check name
      if (name.includes(openingMatch)) return true;
      
      // Check ECO code
      if (eco.includes(openingMatch)) return true;
      
      // Check ECO ranges for common openings
      if (openingMatch === 'italian' && eco.match(/^c5[0-9]$/)) return true;
      if (openingMatch === 'sicilian' && eco.match(/^b[2-9][0-9]$/)) return true;
      if (openingMatch === 'french' && eco.match(/^c[0-1][0-9]$/)) return true;
      if (openingMatch === 'ruy lopez' && eco.match(/^c[6-9][0-9]$/)) return true;
      if (openingMatch === 'spanish' && eco.match(/^c[6-9][0-9]$/)) return true;
      
      return false;
    });
    
    if (filtered.length > 0) {
      return {
        games: filtered.slice(0, maxGames),
        reason: `Found ${filtered.length} games with ${openingMatch}`
      };
    }
  }

  // Check for result filters
  if (q.includes('win') || q.includes('won') || q.includes('victory') || q.includes('victories')) {
    const wins = allGames.filter(g => g.result === 'win');
    if (wins.length > 0) {
      return {
        games: wins.slice(0, maxGames),
        reason: `Found ${wins.length} winning games`
      };
    }
  }

  if (q.includes('loss') || q.includes('lost') || q.includes('lose') || q.includes('losing')) {
    const losses = allGames.filter(g => g.result === 'loss');
    if (losses.length > 0) {
      return {
        games: losses.slice(0, maxGames),
        reason: `Found ${losses.length} losing games`
      };
    }
  }

  if (q.includes('draw')) {
    const draws = allGames.filter(g => g.result === 'draw');
    if (draws.length > 0) {
      return {
        games: draws.slice(0, maxGames),
        reason: `Found ${draws.length} drawn games`
      };
    }
  }

  // Check for time control mentions
  if (q.includes('bullet')) {
    const bullet = allGames.filter(g => g.timeControl.type === 'bullet');
    if (bullet.length > 0) {
      return {
        games: bullet.slice(0, maxGames),
        reason: `Found ${bullet.length} bullet games`
      };
    }
  }

  if (q.includes('blitz')) {
    const blitz = allGames.filter(g => g.timeControl.type === 'blitz');
    if (blitz.length > 0) {
      return {
        games: blitz.slice(0, maxGames),
        reason: `Found ${blitz.length} blitz games`
      };
    }
  }

  if (q.includes('rapid')) {
    const rapid = allGames.filter(g => g.timeControl.type === 'rapid');
    if (rapid.length > 0) {
      return {
        games: rapid.slice(0, maxGames),
        reason: `Found ${rapid.length} rapid games`
      };
    }
  }

  // Check for recent mentions
  if (q.includes('recent') || q.includes('lately') || q.includes('last')) {
    return {
      games: allGames.slice(0, maxGames),
      reason: `Showing ${Math.min(maxGames, allGames.length)} most recent games`
    };
  }

  // Check for mistake/blunder mentions
  if (q.includes('mistake') || q.includes('blunder') || q.includes('error')) {
    const highMistakes = allGames
      .filter(g => (g.mistakes || 0) + (g.blunders || 0) > 2)
      .sort((a, b) => ((b.blunders || 0) + (b.mistakes || 0)) - ((a.blunders || 0) + (a.mistakes || 0)));
    
    if (highMistakes.length > 0) {
      return {
        games: highMistakes.slice(0, maxGames),
        reason: `Found ${highMistakes.length} games with significant mistakes`
      };
    }
  }

  // No specific filter matched
  return null;
}

/**
 * Detects opening names in the question
 */
function detectOpening(question: string): string | null {
  const commonOpenings = [
    'italian',
    'sicilian',
    'french',
    'caro-kann',
    'caro kann',
    'queens gambit',
    "queen's gambit",
    'kings gambit',
    "king's gambit",
    'ruy lopez',
    'spanish',
    'london',
    'english',
    'nimzo',
    'grunfeld',
    'slav',
    'scandinavian',
    'pirc',
    'alekhine',
    'benoni',
    'dutch',
    'catalan',
  ];

  for (const opening of commonOpenings) {
    if (question.includes(opening)) {
      return opening;
    }
  }

  return null;
}

/**
 * Formats games for inclusion in LLM prompt with enhanced references
 */
export function formatGamesForPrompt(games: CompactGameSummaryT[]): string {
  return games.map((g, idx) => {
    const result = g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : 'Drew';
    const mistakes = (g.mistakes || 0) + (g.blunders || 0);
    const blunders = g.blunders || 0;
    const date = formatDate(g.date);
    const opponent = g.opponent || 'Unknown';
    const chesscomUrl = g.chesscomUrl || null;
    
    // Format key positions with FEN and evaluations for analysis
    const positions = g.keyPositions.map(kp => {
      const tags = kp.tag.join(', ');
      const moveNotation = kp.move ? ` ${kp.move}` : '';
      
      // Show evaluation before and after the move
      let evalText = '';
      if (kp.evalBefore !== null && kp.evalAfter !== null) {
        const swing = kp.evalAfter - kp.evalBefore;
        const swingText = swing > 0 ? `+${swing.toFixed(2)}` : swing.toFixed(2);
        evalText = ` (eval: ${kp.evalBefore.toFixed(2)} → ${kp.evalAfter.toFixed(2)}, swing: ${swingText})`;
        
        // Annotate significant swings
        if (Math.abs(swing) > 2) {
          evalText += ' [BLUNDER]';
        } else if (Math.abs(swing) > 1) {
          evalText += ' [MISTAKE]';
        }
      } else if (kp.evalAfter !== null) {
        evalText = ` (eval: ${kp.evalAfter > 0 ? '+' : ''}${kp.evalAfter.toFixed(2)})`;
      }
      
      const bestMove = kp.bestMove ? ` best: ${kp.bestMove}` : '';
      return `\n    Move ${kp.moveNo}${moveNotation} (${kp.side}): ${tags}${evalText}${bestMove}\n    FEN: ${kp.fen}`;
    }).join('');

    const urlLine = chesscomUrl ? `\n  Chess.com URL: ${chesscomUrl}` : '';

    return `
Game ${idx + 1}: vs ${opponent} (${date})
  Result: ${result} as ${g.userColor}
  Opening: ${g.opening.name || g.opening.eco || 'Unknown'}
  Ratings: You ${g.userRating} vs Opponent ${g.oppRating}
  Time Control: ${g.timeControl.type}
  Mistakes: ${mistakes} (${blunders} blunders)${urlLine}
  Key Positions:${positions}
`;
  }).join('\n---\n');
}

/**
 * Format date for display (e.g., "Oct 15, 2024")
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

