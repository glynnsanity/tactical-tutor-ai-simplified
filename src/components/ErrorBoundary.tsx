import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radii } from '../theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    console.log('[ErrorBoundary] Caught error:', error.message);
    console.log('[ErrorBoundary] Error stack:', error.stack);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error('[ErrorBoundary] Error caught:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
  }

  resetError = () => {
    console.log('[ErrorBoundary] Resetting error');
    this.setState({ hasError: false, error: null });
  };

  render() {
    console.log('[ErrorBoundary] ===== render() called =====');
    console.log('[ErrorBoundary] hasError:', this.state.hasError);
    console.log('[ErrorBoundary] error:', this.state.error);
    
    if (this.state.hasError) {
      console.log('[ErrorBoundary] ===== Rendering error UI =====');
      console.log('[ErrorBoundary] Error message:', this.state.error?.message);
      console.log('[ErrorBoundary] Error stack:', this.state.error?.stack);
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.title}>Oops! Something went wrong</Text>
            <Text style={styles.message}>
              We encountered an unexpected error. Please try again.
            </Text>
            
            {__DEV__ && this.state.error && (
              <View style={styles.errorDetails}>
                <Text style={styles.errorTitle}>Error Details (Dev Only):</Text>
                <Text style={styles.errorText}>{this.state.error.toString()}</Text>
              </View>
            )}

            <TouchableOpacity 
              style={styles.button} 
              onPress={this.resetError}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    console.log('[ErrorBoundary] ===== Rendering children (no error) =====');
    console.log('[ErrorBoundary] Children count:', React.Children.count(this.props.children));
    console.log('[ErrorBoundary] Children type:', typeof this.props.children);
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing(6),
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing(4),
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing(2),
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing(6),
  },
  errorDetails: {
    backgroundColor: colors.secondaryBg,
    borderRadius: radii.md,
    padding: spacing(4),
    marginBottom: spacing(6),
    maxHeight: 150,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing(2),
  },
  errorText: {
    fontSize: 12,
    color: colors.mutedText,
    fontFamily: 'Menlo',
  },
  button: {
    backgroundColor: colors.coachPrimary,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(8),
    borderRadius: radii.md,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
