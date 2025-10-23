import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingIntro from '../screens/OnboardingIntro';
import ChessComUsername from '../screens/ChessComUsername';
import OnboardingDone from '../screens/OnboardingDone';

export type OnboardingStackParamList = {
  OnboardingIntro: undefined;
  ChessComUsername: undefined;
  OnboardingDone: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OnboardingIntro" component={OnboardingIntro} />
      <Stack.Screen name="ChessComUsername" component={ChessComUsername} />
      <Stack.Screen name="OnboardingDone" component={OnboardingDone} />
    </Stack.Navigator>
  );
}
