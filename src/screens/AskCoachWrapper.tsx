import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Wrap AskCoach to ensure React Navigation can handle it properly
let AskCoachComponent: any = null;

try {
  console.log('[AskCoachWrapper] Attempting to dynamically import AskCoach');
  const AskCoachModule = require('./AskCoach');
  AskCoachComponent = AskCoachModule.default;
  console.log('[AskCoachWrapper] AskCoach imported successfully:', typeof AskCoachComponent);
} catch (e) {
  console.error('[AskCoachWrapper] Error importing AskCoach:', e);
}

export default function AskCoachWrapper(props: any) {
  console.log('[AskCoachWrapper] ===== RENDER CALLED =====');
  console.log('[AskCoachWrapper] Props:', props);
  console.log('[AskCoachWrapper] AskCoachComponent:', AskCoachComponent ? 'exists' : 'null');
  
  if (!AskCoachComponent) {
    console.log('[AskCoachWrapper] AskCoach not available, showing fallback');
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>AskCoach Not Available</Text>
          <Text style={styles.subtitle}>The AskCoach component could not be loaded</Text>
        </View>
      </SafeAreaView>
    );
  }

  console.log('[AskCoachWrapper] Rendering AskCoach component');
  try {
    return <AskCoachComponent {...props} />;
  } catch (e) {
    console.error('[AskCoachWrapper] Error rendering AskCoach:', e);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Error Loading AskCoach</Text>
          <Text style={styles.subtitle}>{String(e)}</Text>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
});

