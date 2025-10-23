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


