import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

export default function AskCoachSimple() {
  console.log('[AskCoachSimple] ===== Rendering =====');
  const navigation = useNavigation();
  
  useEffect(() => {
    console.log('[AskCoachSimple] useEffect - Component mounted');
    console.log('[AskCoachSimple] Navigation object:', navigation ? 'exists' : 'null');
    
    // Try navigating to Chat after a delay to test if it works
    const timer = setTimeout(() => {
      console.log('[AskCoachSimple] Attempting to navigate to Chat...');
      try {
        // @ts-ignore
        navigation.navigate('Chat');
        console.log('[AskCoachSimple] Navigate call succeeded');
      } catch (e) {
        console.error('[AskCoachSimple] Error navigating to Chat:', e);
      }
    }, 2000);
    
    return () => {
      console.log('[AskCoachSimple] Cleanup - clearing timer');
      clearTimeout(timer);
    };
  }, [navigation]);
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Ask Your Coach (Simple)</Text>
        <Text style={styles.subtitle}>Simplified version - if you see this, navigation works!</Text>
        <Text style={styles.subtitle}>Will auto-navigate to Chat in 2 seconds...</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => {
            console.log('[AskCoachSimple] Button pressed - navigating to Chat');
            try {
              // @ts-ignore
              navigation.navigate('Chat');
            } catch (e) {
              console.error('[AskCoachSimple] Button navigation error:', e);
            }
          }}
        >
          <Text style={styles.buttonText}>Go to Chat Now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
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
    marginBottom: 8,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

