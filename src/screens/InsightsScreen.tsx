import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import ScreenHeader from '../components/ScreenHeader';
import Board from '../components/chess/Board';
import { theme } from '../theme';

interface Insight {
  id: string;
  title: string;
  summary: string;
  impact: string;
  priority: number;
  category: string;
  actionPlan: {
    immediate: string;
    nextGames: string[];
    studyPlan: string[];
    resources?: string[];
  };
  evidence: {
    totalGames: number;
    totalPositions: number;
    exampleGames: Array<{
      gameId: string;
      opponent: string;
      chesscomUrl: string | null;
      moveNo: number;
      fen: string;
      description: string;
      evalLoss: number;
    }>;
  };
  estimatedRatingImpact: number;
  confidence: number;
}

interface InsightsResponse {
  userId: string;
  insights: Insight[];
  statistics: {
    totalGames: number;
    totalPositions: number;
    patternsDiscovered: number;
    insightsGenerated: number;
    analysisTimeMs: number;
    potentialRatingGain: number;
  };
}

export default function InsightsScreen() {
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // TODO: Get userId from AsyncStorage
      const userId = 'midnightcontender';
      
      const response = await fetch(
        `http://localhost:8787/insights?userId=${userId}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      
      const data = await response.json();
      setInsights(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const toggleInsight = (id: string) => {
    setExpandedInsight(expandedInsight === id ? null : id);
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'weakness':
        return '#ff6b6b';
      case 'strength':
        return '#51cf66';
      case 'opening':
        return '#339af0';
      case 'phase':
        return '#ff922b';
      default:
        return '#868e96';
    }
  };

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case 'weakness':
        return '⚠️';
      case 'strength':
        return '✅';
      case 'opening':
        return '♟️';
      case 'phase':
        return '🎯';
      default:
        return '📊';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <ScreenHeader title="Your Chess Insights" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Analyzing your games...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !insights) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <ScreenHeader title="Your Chess Insights" />
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error || 'No insights available'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchInsights}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScreenHeader title="Your Chess Insights" />
      
      <ScrollView style={styles.scrollView}>
        {/* Statistics Summary */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Analysis Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{insights.statistics.totalGames}</Text>
              <Text style={styles.statLabel}>Games</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{insights.statistics.patternsDiscovered}</Text>
              <Text style={styles.statLabel}>Patterns</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#51cf66' }]}>
                +{insights.statistics.potentialRatingGain}
              </Text>
              <Text style={styles.statLabel}>Potential</Text>
            </View>
          </View>
        </View>

        {/* Insights List */}
        {insights.insights.map((insight, index) => (
          <View key={insight.id} style={styles.insightCard}>
            <TouchableOpacity
              onPress={() => toggleInsight(insight.id)}
              activeOpacity={0.7}
            >
              <View style={styles.insightHeader}>
                <View style={styles.insightHeaderLeft}>
                  <Text style={styles.insightIcon}>
                    {getCategoryIcon(insight.category)}
                  </Text>
                  <View style={styles.insightHeaderText}>
                    <Text style={styles.insightNumber}>#{index + 1}</Text>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.priorityBadge,
                    { backgroundColor: getCategoryColor(insight.category) },
                  ]}
                >
                  <Text style={styles.priorityText}>{insight.priority}/10</Text>
                </View>
              </View>

              <Text style={styles.insightSummary}>{insight.summary}</Text>

              <View style={styles.impactContainer}>
                <Text style={styles.impactLabel}>Impact:</Text>
                <Text style={styles.impactValue}>
                  {insight.estimatedRatingImpact >= 0 ? '+' : ''}
                  {insight.estimatedRatingImpact} rating points
                </Text>
              </View>
            </TouchableOpacity>

            {expandedInsight === insight.id && (
              <View style={styles.expandedContent}>
                {/* Immediate Action */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>⚡ DO THIS RIGHT NOW:</Text>
                  <Text style={styles.actionText}>{insight.actionPlan.immediate}</Text>
                </View>

                {/* Next Games */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📝 In Your Next 10 Games:</Text>
                  {insight.actionPlan.nextGames.map((action, idx) => (
                    <Text key={idx} style={styles.bulletText}>
                      • {action}
                    </Text>
                  ))}
                </View>

                {/* Study Plan */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📚 Study Plan:</Text>
                  {insight.actionPlan.studyPlan.map((topic, idx) => (
                    <Text key={idx} style={styles.bulletText}>
                      • {topic}
                    </Text>
                  ))}
                </View>

                {/* Example Position */}
                {insight.evidence.exampleGames.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🔍 Example Position:</Text>
                    <View style={styles.exampleContainer}>
                      <Board
                        fen={insight.evidence.exampleGames[0].fen}
                        size={280}
                      />
                      <Text style={styles.exampleDescription}>
                        {insight.evidence.exampleGames[0].description}
                      </Text>
                      <Text style={styles.exampleDetails}>
                        vs {insight.evidence.exampleGames[0].opponent} • Move{' '}
                        {insight.evidence.exampleGames[0].moveNo}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Evidence Stats */}
                <View style={styles.evidenceContainer}>
                  <Text style={styles.evidenceText}>
                    Based on {insight.evidence.totalPositions} positions across{' '}
                    {insight.evidence.totalGames} games
                  </Text>
                  <Text style={styles.confidenceText}>
                    Confidence: {(insight.confidence * 100).toFixed(0)}%
                  </Text>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  errorText: {
    fontSize: 16,
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  insightCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  insightHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  insightIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  insightHeaderText: {
    flex: 1,
  },
  insightNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  insightTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    lineHeight: 24,
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  insightSummary: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  impactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(81, 207, 102, 0.1)',
    padding: 12,
    borderRadius: 8,
  },
  impactLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginRight: 8,
  },
  impactValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#51cf66',
  },
  expandedContent: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
    backgroundColor: 'rgba(255, 146, 43, 0.1)',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff922b',
  },
  bulletText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  exampleContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 8,
  },
  exampleDescription: {
    fontSize: 14,
    color: theme.colors.text,
    marginTop: 12,
    textAlign: 'center',
  },
  exampleDetails: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  evidenceContainer: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  evidenceText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  confidenceText: {
    fontSize: 12,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: 4,
  },
});

