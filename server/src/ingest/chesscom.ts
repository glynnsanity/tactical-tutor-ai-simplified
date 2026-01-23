export async function listArchives(username: string): Promise<string[]> {
  const u = username.trim().toLowerCase();
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`chess.com archives failed: ${res.status}`);
  }
  const data = (await res.json()) as { archives?: string[] };
  const arr = Array.isArray(data.archives) ? data.archives : [];
  // Latest first (last→first order)
  return arr.slice().reverse();
}

export async function fetchArchive(archiveUrl: string): Promise<string> {
  const url = archiveUrl.endsWith('/pgn') ? archiveUrl : `${archiveUrl}/pgn`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`chess.com archive fetch failed: ${res.status}`);
  }
  return await res.text();
}

/**
 * Fetch opening name from Chess.com's opening database by ECO code
 * Cache results to avoid repeated API calls
 */
const openingCache = new Map<string, string | null>();

export async function fetchOpeningName(eco: string | null): Promise<string | null> {
  if (!eco) return null;
  
  // Check cache first
  if (openingCache.has(eco)) {
    return openingCache.get(eco) || null;
  }
  
  try {
    // Chess.com doesn't have a direct ECO->name API, but we can use their opening explorer
    // For now, use a static mapping of common ECO codes
    // In production, you might scrape or use a chess opening database
    const name = getOpeningNameFromECO(eco);
    openingCache.set(eco, name);
    return name;
  } catch (error) {
    openingCache.set(eco, null);
    return null;
  }
}

/**
 * Static mapping of ECO codes to opening names
 * Based on standard chess opening theory
 */
function getOpeningNameFromECO(eco: string): string | null {
  const ecoMap: Record<string, string> = {
    // Italian Game (C50-C59)
    'C50': 'Italian Game',
    'C51': 'Italian Game: Evans Gambit',
    'C52': 'Italian Game: Evans Gambit Declined',
    'C53': 'Italian Game: Giuoco Piano',
    'C54': 'Italian Game: Giuoco Piano, Cracow Variation',
    'C55': 'Italian Game: Two Knights Defense',
    'C56': 'Italian Game: Two Knights Defense, Traxler Variation',
    'C57': 'Italian Game: Two Knights Defense, Fried Liver Attack',
    'C58': 'Italian Game: Two Knights Defense, Polerio Defense',
    'C59': 'Italian Game: Two Knights Defense, Steinitz Variation',
    
    // Sicilian Defense (B20-B99)
    'B20': 'Sicilian Defense',
    'B21': 'Sicilian Defense: Smith-Morra Gambit',
    'B22': 'Sicilian Defense: Alapin Variation',
    'B23': 'Sicilian Defense: Closed Variation',
    'B30': 'Sicilian Defense: Old Sicilian',
    'B40': 'Sicilian Defense: French Variation',
    'B50': 'Sicilian Defense',
    'B60': 'Sicilian Defense: Richter-Rauzer',
    'B70': 'Sicilian Defense: Dragon Variation',
    'B80': 'Sicilian Defense: Scheveningen Variation',
    'B90': 'Sicilian Defense: Najdorf Variation',
    
    // French Defense (C00-C19)
    'C00': 'French Defense',
    'C01': 'French Defense: Exchange Variation',
    'C02': 'French Defense: Advance Variation',
    'C10': 'French Defense: Rubinstein Variation',
    'C11': 'French Defense: Classical Variation',
    'C15': 'French Defense: Winawer Variation',
    
    // Caro-Kann (B10-B19)
    'B10': 'Caro-Kann Defense',
    'B12': 'Caro-Kann Defense: Advance Variation',
    'B13': 'Caro-Kann Defense: Exchange Variation',
    'B14': 'Caro-Kann Defense: Panov Attack',
    'B17': 'Caro-Kann Defense: Steinitz Variation',
    'B18': 'Caro-Kann Defense: Classical Variation',
    
    // Ruy Lopez / Spanish (C60-C99)
    'C60': 'Ruy Lopez',
    'C65': 'Ruy Lopez: Berlin Defense',
    'C70': 'Ruy Lopez: Morphy Defense',
    'C80': 'Ruy Lopez: Open Variation',
    'C90': 'Ruy Lopez: Closed Variation',
    
    // Scandinavian (B01)
    'B01': 'Scandinavian Defense',
    
    // Pirc Defense (B07-B09)
    'B07': 'Pirc Defense',
    'B08': 'Pirc Defense: Classical Variation',
    'B09': 'Pirc Defense: Austrian Attack',
    
    // Modern Defense (B06)
    'B06': 'Modern Defense',
    
    // Alekhine's Defense (B02-B05)
    'B02': "Alekhine's Defense",
    'B03': "Alekhine's Defense: Exchange Variation",
    'B04': "Alekhine's Defense: Modern Variation",
    
    // King's Pawn Game (C40-C49)
    'C40': "King's Pawn Game",
    'C41': "King's Pawn Game: Philidor Defense",
    'C42': "King's Pawn Game: Petrov's Defense",
    'C44': "King's Pawn Game: Scotch Game",
    
    // Queen's Gambit (D06-D69)
    'D06': "Queen's Gambit",
    'D10': "Queen's Gambit: Slav Defense",
    'D30': "Queen's Gambit Declined",
    'D40': "Queen's Gambit Declined: Semi-Tarrasch",
    'D50': "Queen's Gambit Declined: Modern Variation",
    
    // English Opening (A10-A39)
    'A10': 'English Opening',
    'A20': 'English Opening: Reversed Sicilian',
    'A30': 'English Opening: Symmetrical Variation',
    
    // Uncommon / Other
    'A00': 'Uncommon Opening',
    'A04': 'Reti Opening',
    'A40': 'Queen Pawn Game',
    'A46': 'Queen Pawn Game: Torre Attack',
    'A48': 'Queen Pawn Game: London System',
    'B00': 'Uncommon King Pawn Opening',
  };
  
  return ecoMap[eco] || null;
}


