/**
 * React Native Hook for Analysis Progress
 *
 * Connects to the SSE streaming endpoint and provides real-time
 * progress updates for the UI.
 *
 * Usage:
 *   const { progress, startAnalysis, isAnalyzing } = useAnalysisProgress(userId);
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

export interface AnalysisProgress {
  userId: string;
  status: 'pending' | 'fetching' | 'analyzing' | 'complete' | 'error';
  totalGames: number;
  gamesAnalyzed: number;
  gamesRemaining: number;
  percentComplete: number;
  estimatedSecondsRemaining: number | null;
  gamesPerMinute: number | null;
  currentBatch: number;
  totalBatches: number;
  startedAt: number;
  completedAt: number | null;
  error?: string;
}

interface UseAnalysisProgressReturn {
  progress: AnalysisProgress | null;
  isAnalyzing: boolean;
  isComplete: boolean;
  error: string | null;
  startAnalysis: (username: string, limitGames?: number) => void;
  checkStatus: () => Promise<AnalysisProgress | null>;
}

/**
 * Parse SSE event from raw text
 */
function parseSSEEvent(text: string): { event: string; data: any } | null {
  const lines = text.split('\n');
  let event = '';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      event = line.slice(7);
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (event && data) {
    try {
      return { event, data: JSON.parse(data) };
    } catch {
      return { event, data };
    }
  }

  return null;
}

export function useAnalysisProgress(userId: string): UseAnalysisProgressReturn {
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isAnalyzing = progress?.status === 'analyzing' || progress?.status === 'fetching';
  const isComplete = progress?.status === 'complete';

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  /**
   * Check current analysis status (non-streaming)
   */
  const checkStatus = useCallback(async (): Promise<AnalysisProgress | null> => {
    try {
      const response = await fetch(`${API_BASE}/analyze/status?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setProgress(data);
      return data;
    } catch (err) {
      console.error('Failed to check status:', err);
      return null;
    }
  }, [userId]);

  /**
   * Start analysis with SSE streaming progress
   */
  const startAnalysis = useCallback(
    async (username: string, limitGames: number = 500) => {
      // Abort any existing connection
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setError(null);
      setProgress({
        userId,
        status: 'fetching',
        totalGames: 0,
        gamesAnalyzed: 0,
        gamesRemaining: 0,
        percentComplete: 0,
        estimatedSecondsRemaining: null,
        gamesPerMinute: null,
        currentBatch: 0,
        totalBatches: 0,
        startedAt: Date.now(),
        completedAt: null,
      });

      try {
        const url = `${API_BASE}/analyze/stream?username=${username}&userId=${userId}&limitGames=${limitGames}`;

        // React Native SSE implementation using fetch with streaming
        const response = await fetch(url, {
          signal: abortControllerRef.current.signal,
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete events (separated by double newline)
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // Keep incomplete event in buffer

          for (const eventText of events) {
            if (!eventText.trim()) continue;

            const parsed = parseSSEEvent(eventText);
            if (!parsed) continue;

            switch (parsed.event) {
              case 'status':
                console.log('[Analysis] Status:', parsed.data.message);
                break;

              case 'games_found':
                console.log('[Analysis] Found games:', parsed.data.totalGames);
                setProgress((prev) =>
                  prev
                    ? {
                        ...prev,
                        totalGames: parsed.data.totalGames,
                        gamesRemaining: parsed.data.totalGames,
                        status: 'analyzing',
                      }
                    : null
                );
                break;

              case 'progress':
                setProgress(parsed.data);
                break;

              case 'complete':
                console.log('[Analysis] Complete!');
                setProgress(parsed.data);
                break;

              case 'error':
                console.error('[Analysis] Error:', parsed.data.error);
                setError(parsed.data.error);
                break;

              case 'already_running':
                console.log('[Analysis] Already running, subscribing to updates');
                setProgress(parsed.data);
                break;
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('[Analysis] Aborted');
          return;
        }
        console.error('[Analysis] Stream error:', err);
        setError(err.message || 'Analysis failed');
        setProgress((prev) =>
          prev ? { ...prev, status: 'error', error: err.message } : null
        );
      }
    },
    [userId]
  );

  return {
    progress,
    isAnalyzing,
    isComplete,
    error,
    startAnalysis,
    checkStatus,
  };
}
