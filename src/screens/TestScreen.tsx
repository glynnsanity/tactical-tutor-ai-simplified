import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function TestScreen() {
  console.log('[TestScreen] Rendering');
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Test Screen Works!</Text>
      <Text style={styles.subtext}>If you see this, navigation is working</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  text: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  subtext: {
    fontSize: 16,
    color: '#6b7280',
  },
});

