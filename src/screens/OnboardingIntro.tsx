import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radii, shadows } from '../theme';

const { width: screenWidth } = Dimensions.get('window');

interface Card {
  title: string;
  body: string;
}

const cards: Card[] = [
  {
    title: 'Your Personal Chess Coach',
    body: 'Ask questions about tactics, strategy, and your games. Get instant personalized analysis from an AI coach.',
  },
  {
    title: 'Real-time Guidance',
    body: 'Type any position or question and get AI-powered insights based on your game analysis.',
  },
  {
    title: 'Learn and Improve',
    body: 'Chat with your coach anytime to understand chess concepts and improve your gameplay.',
  },
];

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

export default function OnboardingIntro({ navigation }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      navigation.navigate('ChessComUsername');
    }
  };

  const handleSkip = () => {
    navigation.navigate('ChessComUsername');
  };

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / screenWidth);
    setCurrentIndex(index);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.scrollView}
      >
        {cards.map((card, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardContent}>
              <Text style={styles.title}>{card.title}</Text>
              <Text style={styles.body}>{card.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.pagination}>
        {cards.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentIndex === index && styles.activeDot,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Page ${index + 1} of ${cards.length}`}
          />
        ))}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={currentIndex === cards.length - 1 ? 'Continue' : 'Next'}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === cards.length - 1 ? 'Continue' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  card: {
    width: screenWidth,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing(6),
  },
  cardContent: {
    backgroundColor: colors.cardBg,
    borderRadius: radii.lg,
    padding: spacing(6),
    ...shadows.card,
    maxWidth: screenWidth - spacing(12),
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing(4),
    lineHeight: 32,
  },
  body: {
    fontSize: 16,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing(4),
    gap: spacing(2),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cardBorder,
  },
  activeDot: {
    backgroundColor: colors.coachPrimary,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(6),
    gap: spacing(4),
  },
  skipButton: {
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
    minHeight: 44,
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    color: colors.mutedText,
    fontWeight: '500',
  },
  nextButton: {
    backgroundColor: colors.coachPrimary,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(6),
    borderRadius: radii.md,
    minHeight: 44,
    justifyContent: 'center',
    flex: 1,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    color: colors.background,
    fontWeight: '600',
  },
});
