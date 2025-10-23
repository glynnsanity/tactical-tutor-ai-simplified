import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../theme';

export default function OnboardingDone() {
  useEffect(() => {
    const completeOnboarding = async () => {
      try {
        await AsyncStorage.setItem('onboardingComplete', '1');
        
        console.log('[OnboardingDone] Onboarding marked complete');
        
        // Trigger an app state change to notify listeners (like in App.tsx)
        // This will cause App.tsx's AppState listener to fire
        AppState.currentState;
      } catch (error) {
        console.error('Failed to complete onboarding:', error);
      }
    };

    // Complete onboarding after a short delay to show the screen
    const timer = setTimeout(completeOnboarding, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>You're all set! 🎉</Text>
          <Text style={styles.subtitle}>
            Ready to start chatting with your chess coach?
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing(6),
    paddingTop: spacing(8),
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing(4),
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 16,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 24,
  },
});
