import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing } from '../theme';

type RootStackParamList = {
  OnboardingIntro: undefined;
  ChessComUsername: undefined;
  OnboardingDone: undefined;
  Chat: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function OnboardingDone() {
  const navigation = useNavigation<NavigationProp>();

  useEffect(() => {
    const completeOnboarding = async () => {
      try {
        await AsyncStorage.setItem('onboardingComplete', '1');
        console.log('[OnboardingDone] Onboarding marked complete');
        
        // Navigate directly to Chat after a short delay
        setTimeout(() => {
          navigation.navigate('Chat');
        }, 1500);
      } catch (error) {
        console.error('Failed to complete onboarding:', error);
      }
    };

    completeOnboarding();
  }, [navigation]);

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