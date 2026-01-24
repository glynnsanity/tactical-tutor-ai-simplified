/**
 * Analysis Session Manager
 *
 * Tracks ongoing analysis sessions and provides progress updates.
 * Enables real-time progress streaming and incremental results.
 */

import { EventEmitter } from 'events';

export interface AnalysisProgress {
  userId: string;
  status: 'pending' | 'fetching' | 'analyzing' | 'complete' | 'error';
  totalGames: number;
  gamesAnalyzed: number;
  gamesRemaining: number;
  percentComplete: number;
  estimatedSecondsRemaining: number | null;
  currentBatch: number;
  totalBatches: number;
  gamesPerMinute: number | null;
  startedAt: number;
  completedAt: number | null;
  error?: string;
}

interface AnalysisSession {
  progress: AnalysisProgress;
  emitter: EventEmitter;
  abortController: AbortController;
}

// In-memory store of active analysis sessions
const sessions = new Map<string, AnalysisSession>();

/**
 * Create a new analysis session
 */
export function createSession(userId: string, totalGames: number): AnalysisSession {
  // Cancel any existing session for this user
  const existing = sessions.get(userId);
  if (existing) {
    existing.abortController.abort();
    existing.emitter.emit('cancelled');
  }

  const session: AnalysisSession = {
    progress: {
      userId,
      status: 'pending',
      totalGames,
      gamesAnalyzed: 0,
      gamesRemaining: totalGames,
      percentComplete: 0,
      estimatedSecondsRemaining: null,
      currentBatch: 0,
      totalBatches: Math.ceil(totalGames / 8), // BATCH_SIZE = 8
      gamesPerMinute: null,
      startedAt: Date.now(),
      completedAt: null,
    },
    emitter: new EventEmitter(),
    abortController: new AbortController(),
  };

  sessions.set(userId, session);
  return session;
}

/**
 * Get an existing session
 */
export function getSession(userId: string): AnalysisSession | undefined {
  return sessions.get(userId);
}

/**
 * Get current progress for a user (even if no active session)
 */
export function getProgress(userId: string): AnalysisProgress | null {
  const session = sessions.get(userId);
  if (!session) return null;
  return { ...session.progress };
}

/**
 * Update session progress
 */
export function updateProgress(
  userId: string,
  updates: Partial<AnalysisProgress>
): void {
  const session = sessions.get(userId);
  if (!session) return;

  const prev = session.progress;
  session.progress = { ...prev, ...updates };

  // Calculate derived fields
  const elapsed = (Date.now() - session.progress.startedAt) / 1000;
  if (session.progress.gamesAnalyzed > 0 && elapsed > 0) {
    session.progress.gamesPerMinute = (session.progress.gamesAnalyzed / elapsed) * 60;

    if (session.progress.gamesPerMinute > 0) {
      session.progress.estimatedSecondsRemaining =
        (session.progress.gamesRemaining / session.progress.gamesPerMinute) * 60;
    }
  }

  session.progress.percentComplete = session.progress.totalGames > 0
    ? Math.round((session.progress.gamesAnalyzed / session.progress.totalGames) * 100)
    : 0;

  // Emit progress event
  session.emitter.emit('progress', session.progress);
}

/**
 * Mark session as complete
 */
export function completeSession(userId: string): void {
  const session = sessions.get(userId);
  if (!session) return;

  session.progress.status = 'complete';
  session.progress.completedAt = Date.now();
  session.progress.gamesRemaining = 0;
  session.progress.percentComplete = 100;
  session.progress.estimatedSecondsRemaining = 0;

  session.emitter.emit('progress', session.progress);
  session.emitter.emit('complete', session.progress);
}

/**
 * Mark session as errored
 */
export function errorSession(userId: string, error: string): void {
  const session = sessions.get(userId);
  if (!session) return;

  session.progress.status = 'error';
  session.progress.error = error;
  session.progress.completedAt = Date.now();

  session.emitter.emit('progress', session.progress);
  session.emitter.emit('error', { error, progress: session.progress });
}

/**
 * Subscribe to progress updates
 */
export function subscribeToProgress(
  userId: string,
  callback: (progress: AnalysisProgress) => void
): () => void {
  const session = sessions.get(userId);
  if (!session) {
    // Return no-op unsubscribe if no session
    return () => {};
  }

  session.emitter.on('progress', callback);

  // Return unsubscribe function
  return () => {
    session.emitter.off('progress', callback);
  };
}

/**
 * Check if analysis is in progress for a user
 */
export function isAnalyzing(userId: string): boolean {
  const session = sessions.get(userId);
  if (!session) return false;
  return session.progress.status === 'fetching' || session.progress.status === 'analyzing';
}

/**
 * Clean up old completed sessions (call periodically)
 */
export function cleanupOldSessions(maxAgeMs: number = 30 * 60 * 1000): void {
  const now = Date.now();
  for (const [userId, session] of sessions) {
    if (session.progress.completedAt && now - session.progress.completedAt > maxAgeMs) {
      sessions.delete(userId);
    }
  }
}
