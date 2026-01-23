const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

export interface AskResponse {
  jobId: string
}

export interface PollResponse {
  tokens: string[]
  nextCursor: number
  done: boolean
}

export interface IngestResponse {
  userId: string
  added: number
  total: number
  quickStart?: boolean
  backgroundAnalysisStarted?: boolean
  message?: string
}

export async function ask(question: string, userId?: string): Promise<AskResponse> {
  const response = await fetch(`${API_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, userId: userId || null }),
  })

  if (!response.ok) {
    throw new Error(`Ask failed: ${response.statusText}`)
  }

  return response.json()
}

export async function poll(
  jobId: string,
  cursor: number,
  signal?: AbortSignal
): Promise<PollResponse> {
  const response = await fetch(
    `${API_URL}/poll?jobId=${encodeURIComponent(jobId)}&cursor=${cursor}`,
    { signal }
  )

  if (!response.ok) {
    throw new Error(`Poll failed: ${response.statusText}`)
  }

  return response.json()
}

export async function ingestChessCom(
  username: string,
  userId: string,
  options?: {
    quickStart?: boolean
    quickStartGames?: number
    limitGames?: number
  }
): Promise<IngestResponse> {
  const params = new URLSearchParams({
    username,
    userId,
    quickStart: String(options?.quickStart ?? true),
    quickStartGames: String(options?.quickStartGames ?? 10),
    limitGames: String(options?.limitGames ?? 100),
  })

  const response = await fetch(`${API_URL}/ingest/chesscom?${params}`)

  if (!response.ok) {
    throw new Error(`Ingest failed: ${response.statusText}`)
  }

  return response.json()
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`)
    return response.ok
  } catch {
    return false
  }
}

// Validate Chess.com username exists
export async function validateChessComUser(username: string): Promise<{
  valid: boolean
  avatar?: string
}> {
  try {
    const response = await fetch(`https://api.chess.com/pub/player/${username}`)
    if (!response.ok) {
      return { valid: false }
    }
    const data = await response.json()
    return { valid: true, avatar: data.avatar }
  } catch {
    return { valid: false }
  }
}
