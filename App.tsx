// import React, { useEffect, useState } from 'react';
// import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
// import { createNativeStackNavigator } from '@react-navigation/native-stack';
// import { StatusBar } from 'expo-status-bar';
// import { SafeAreaProvider } from 'react-native-safe-area-context';
// import { View, Text, ActivityIndicator, AppState } from 'react-native';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { ErrorBoundary } from './src/components/ErrorBoundary';
// import AskCoach from './src/screens/AskCoach';
// import OnboardingIntro from './src/screens/OnboardingIntro';
// import ChessComUsername from './src/screens/ChessComUsername';
// import OnboardingDone from './src/screens/OnboardingDone';

// export type RootStackParamList = {
//   OnboardingIntro: undefined;
//   ChessComUsername: undefined;
//   OnboardingDone: undefined;
//   Chat: undefined;
// };

// const Stack = createNativeStackNavigator<RootStackParamList>();

// const AppTheme: Theme = {
//   ...DefaultTheme,
//   colors: {
//     ...DefaultTheme.colors,
//     background: '#ffffff',
//   },
// };

// export default function App() {
//   const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
//   const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
//   const currentOnboardingRef = React.useRef<boolean | null>(null);

//   useEffect(() => {
//     // Check onboarding status once on mount and on appstate changes
//     checkOnboardingStatus();
//     const subscription = AppState.addEventListener('change', () => { void checkOnboardingStatus(); });
//     return () => {
//       subscription.remove();
//       if (pollingRef.current) {
//         clearInterval(pollingRef.current);
//       }
//     };
//   }, []);

//   // Poll while onboarding is in progress
//   useEffect(() => {
//     currentOnboardingRef.current = isOnboardingComplete;
//     if (isOnboardingComplete === false) {
//       if (!pollingRef.current) {
//         pollingRef.current = setInterval(checkOnboardingStatus, 1500);
//       }
//     } else if (isOnboardingComplete === true && pollingRef.current) {
//       clearInterval(pollingRef.current);
//       pollingRef.current = null;
//     }
//   }, [isOnboardingComplete]);

//   const checkOnboardingStatus = async () => {
//     try {
//       const onboardingComplete = await AsyncStorage.getItem('onboardingComplete');
//       const shouldSkipOnboarding = onboardingComplete === '1';
//       if (currentOnboardingRef.current !== shouldSkipOnboarding) {
//         setIsOnboardingComplete(shouldSkipOnboarding);
//       }
//     } catch {
//       // default to false (show onboarding)
//       setIsOnboardingComplete(false);
//     }
//   };

//   // Note: We intentionally avoid extra JSX children inside Navigator/NavigationContainer

//   if (isOnboardingComplete === null) {
//     // Show a loading splash screen instead of blank
//     return (
//       <SafeAreaProvider>
//         <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
//           <Text style={{ fontSize: 48, marginBottom: 24 }}>♔</Text>
//           <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 }}>
//             Chess Coach
//           </Text>
//           <ActivityIndicator size="large" color="#0ea5e9" />
//           <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 16 }}>
//             Starting up...
//           </Text>
//         </View>
//       </SafeAreaProvider>
//     );
//   }

//   return (
//     <ErrorBoundary>
//       <SafeAreaProvider>
//         <NavigationContainer theme={AppTheme}>
//           <StatusBar style="dark" />
//           <Stack.Navigator 
//             screenOptions={{ headerShown: false }}
//             initialRouteName={!isOnboardingComplete ? 'OnboardingIntro' : 'Chat'}
//           >
//             <Stack.Screen name="OnboardingIntro" component={OnboardingIntro} />
//             <Stack.Screen name="ChessComUsername" component={ChessComUsername} />
//             <Stack.Screen name="OnboardingDone" component={OnboardingDone} />
//             <Stack.Screen name="Chat" component={AskCoach} />
//           </Stack.Navigator>
//         </NavigationContainer>
//       </SafeAreaProvider>
//     </ErrorBoundary>
//   );
// }

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import OnboardingIntro from './src/screens/OnboardingIntro';
import ChessComUsername from './src/screens/ChessComUsername';
import OnboardingDone from './src/screens/OnboardingDone';
import AskCoach from './src/screens/AskCoach';

type RootStackParamList = {
  OnboardingIntro: undefined;
  ChessComUsername: undefined;
  OnboardingDone: undefined;
  Chat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // Default to false (show onboarding) instead of null
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check once on mount
    AsyncStorage.getItem('onboardingComplete')
      .then((value) => {
        setIsOnboardingComplete(value === '1');
      })
      .catch(() => {
        setIsOnboardingComplete(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Don't render anything until we've checked storage
  if (isLoading) {
    return null; // Or a simple loading view
  }
  
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Stack.Navigator 
            initialRouteName={isOnboardingComplete ? 'Chat' : 'OnboardingIntro'}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="OnboardingIntro" component={OnboardingIntro} />
            <Stack.Screen name="ChessComUsername" component={ChessComUsername} />
            <Stack.Screen name="OnboardingDone" component={OnboardingDone} />
            <Stack.Screen name="Chat" component={AskCoach} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}