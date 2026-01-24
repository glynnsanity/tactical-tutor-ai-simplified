/**
 * Analysis Progress Bar Component
 *
 * Displays real-time analysis progress with:
 * - Animated progress bar
 * - Games analyzed count
 * - Estimated time remaining
 * - Games per minute rate
 */

import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { AnalysisProgress } from './useAnalysisProgress';

interface AnalysisProgressBarProps {
  progress: AnalysisProgress;
  showDetails?: boolean;
}

export function AnalysisProgressBar({
  progress,
  showDetails = true,
}: AnalysisProgressBarProps) {
  const { status, percentComplete, gamesAnalyzed, totalGames, estimatedSecondsRemaining, gamesPerMinute } = progress;

  // Format time remaining
  const formatTimeRemaining = (seconds: number | null): string => {
    if (seconds === null || seconds <= 0) return '';

    if (seconds < 60) {
      return `~${Math.ceil(seconds)}s remaining`;
    } else if (seconds < 3600) {
      const mins = Math.ceil(seconds / 60);
      return `~${mins} min remaining`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.ceil((seconds % 3600) / 60);
      return `~${hours}h ${mins}m remaining`;
    }
  };

  // Status message
  const getStatusMessage = (): string => {
    switch (status) {
      case 'pending':
        return 'Preparing...';
      case 'fetching':
        return 'Fetching your games...';
      case 'analyzing':
        return `Analyzing ${gamesAnalyzed} of ${totalGames} games`;
      case 'complete':
        return `Analysis complete! ${totalGames} games analyzed`;
      case 'error':
        return 'Analysis failed';
      default:
        return '';
    }
  };

  const isActive = status === 'analyzing' || status === 'fetching';

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${percentComplete}%`,
                backgroundColor: status === 'complete' ? '#22c55e' : status === 'error' ? '#ef4444' : '#3b82f6',
              },
            ]}
          />
        </View>
        <Text style={styles.percentText}>{percentComplete}%</Text>
      </View>

      {/* Status message */}
      <Text style={styles.statusText}>{getStatusMessage()}</Text>

      {/* Details */}
      {showDetails && isActive && (
        <View style={styles.detailsContainer}>
          {estimatedSecondsRemaining !== null && estimatedSecondsRemaining > 0 && (
            <Text style={styles.detailText}>
              {formatTimeRemaining(estimatedSecondsRemaining)}
            </Text>
          )}
          {gamesPerMinute !== null && gamesPerMinute > 0 && (
            <Text style={styles.detailText}>
              {gamesPerMinute.toFixed(1)} games/min
            </Text>
          )}
        </View>
      )}

      {/* Tip for users */}
      {isActive && (
        <View style={styles.tipContainer}>
          <Text style={styles.tipText}>
            💡 You can start chatting now! My answers will improve as I analyze more games.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginVertical: 8,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    minWidth: 40,
    textAlign: 'right',
  },
  statusText: {
    marginTop: 8,
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  detailsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#64748b',
  },
  tipContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  tipText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
});
