import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import AskCoach from './src/screens/AskCoach';
import OnboardingIntro from './src/screens/OnboardingIntro';
import ChessComUsername from './src/screens/ChessComUsername';
import OnboardingDone from './src/screens/OnboardingDone';

export type RootStackParamList = {
  OnboardingIntro: undefined;
  ChessComUsername: undefined;
  OnboardingDone: undefined;
  Chat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#ffffff',
  },
};

export default function App() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const pollingRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('[App] Starting - checking onboarding status');
    
    // Check onboarding status once on mount
    checkOnboardingStatus();
    
    // Also listen for app state changes (when user comes back to app)
    const subscription = AppState.addEventListener('change', checkOnboardingStatus);
    
    return () => {
      subscription.remove();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Set up polling when onboarding is in progress
  useEffect(() => {
    if (isOnboardingComplete === false) {
      // Start polling to detect when onboarding completes
      if (!pollingRef.current) {
        console.log('[App] Starting polling for onboarding completion');
        pollingRef.current = setInterval(checkOnboardingStatus, 500);
      }
    } else if (isOnboardingComplete === true && pollingRef.current) {
      // Stop polling when onboarding completes
      console.log('[App] Stopping polling - onboarding complete');
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [isOnboardingComplete]);

  const checkOnboardingStatus = async () => {
    try {
      const onboardingComplete = await AsyncStorage.getItem('onboardingComplete');
      
      console.log('[App] Onboarding status check:', onboardingComplete);
      
      const shouldSkipOnboarding = onboardingComplete === '1';
      console.log('[App] Setting onboarding complete to:', shouldSkipOnboarding);
      setIsOnboardingComplete(shouldSkipOnboarding);
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
      // Default to false (show onboarding) on error
      setIsOnboardingComplete(false);
    }
  };

  console.log('[App] Rendering with isOnboardingComplete:', isOnboardingComplete);

  if (isOnboardingComplete === null) {
    console.log('[App] Rendering splash screen (loading)');
    // Show a loading splash screen instead of blank
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
          <Text style={{ fontSize: 48, marginBottom: 24 }}>♔</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 }}>
            Chess Coach
          </Text>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 16 }}>
            Starting up...
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer theme={AppTheme}>
          <StatusBar style="dark" />
          <Stack.Navigator 
            screenOptions={{ headerShown: false }}
            initialRouteName={!isOnboardingComplete ? 'OnboardingIntro' : 'Chat'}
            key={isOnboardingComplete ? 'chat' : 'onboarding'}
          >
            {!isOnboardingComplete ? (
              // Onboarding screens
              <>
                <Stack.Screen name="OnboardingIntro" component={OnboardingIntro} />
                <Stack.Screen name="ChessComUsername" component={ChessComUsername} />
                <Stack.Screen name="OnboardingDone" component={OnboardingDone} />
              </>
            ) : (
              // Chat screen (after onboarding)
              <Stack.Screen name="Chat" component={AskCoach} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
