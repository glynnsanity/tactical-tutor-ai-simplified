import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radii, shadows } from '../theme';

type UsernameState = 'idle' | 'checking' | 'ok' | 'notfound' | 'invalid' | 'error';

interface ChessComUser {
  username: string;
  avatar?: string;
}

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const USERNAME_REGEX = /^(?=.{3,}$)[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/;

export default function ChessComUsername({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [state, setState] = useState<UsernameState>('idle');
  const [user, setUser] = useState<ChessComUser | null>(null);

  const validateUsername = useCallback((username: string): boolean => {
    return USERNAME_REGEX.test(username);
  }, []);

  const checkUsername = useCallback(async (username: string) => {
    if (!validateUsername(username)) {
      setState('invalid');
      return;
    }

    setState('checking');

    try {
      const response = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}`);
      
      if (response.ok) {
        const data = await response.json();
        setUser({
          username: data.username,
          avatar: data.avatar,
        });
        setState('ok');
      } else if (response.status === 404) {
        setState('notfound');
      } else {
        setState('error');
      }
    } catch (error) {
      setState('error');
    }
  }, [validateUsername]);

  const handleFindMe = useCallback(() => {
    if (!username.trim()) return;
    checkUsername(username.trim());
  }, [username, checkUsername]);

  const handleContinue = useCallback(async () => {
    if (user) {
      try {
        await AsyncStorage.setItem('chesscom.username', user.username);
        if (user.avatar) {
          await AsyncStorage.setItem('chesscom.avatar', user.avatar);
        }
        navigation.navigate('OnboardingDone');
      } catch (error) {
        Alert.alert('Error', 'Failed to save username. Please try again.');
      }
    }
  }, [user, navigation]);

  const handleSkip = useCallback(() => {
    navigation.navigate('OnboardingDone');
  }, [navigation]);

  const getErrorMessage = (): string => {
    switch (state) {
      case 'invalid':
        return 'Usernames must be ≥3 characters, letters/numbers/underscore/dash, starting and ending with a letter or number.';
      case 'notfound':
        return 'We couldn\'t find that Chess.com user.';
      case 'error':
        return 'Something went wrong. Please try again.';
      default:
        return '';
    }
  };

  const isButtonDisabled = state === 'checking' || !username.trim();

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Connect your Chess.com account</Text>
            <Text style={styles.subtitle}>
              We'll analyze your games to create personalized training sessions
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter your Chess.com username"
              placeholderTextColor={colors.mutedText}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              accessibilityLabel="Chess.com username input"
              accessibilityHint="Enter your Chess.com username to connect your account"
            />
            
            <TouchableOpacity
              style={[styles.findButton, isButtonDisabled && styles.findButtonDisabled]}
              onPress={handleFindMe}
              disabled={isButtonDisabled}
              accessibilityRole="button"
              accessibilityLabel="Find Chess.com user"
            >
              {state === 'checking' ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={[styles.findButtonText, isButtonDisabled && styles.findButtonTextDisabled]}>
                  Find me
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {state !== 'idle' && state !== 'checking' && state !== 'ok' && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{getErrorMessage()}</Text>
            </View>
          )}

          {state === 'ok' && user && (
            <View style={styles.successContainer}>
              <View style={styles.userInfo}>
                {user.avatar && (
                  <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>👤</Text>
                  </View>
                )}
                <Text style={styles.usernameText}>{user.username}</Text>
              </View>
              
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinue}
                accessibilityRole="button"
                accessibilityLabel="Continue with this username"
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.skipContainer}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip username setup"
            >
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing(6),
    paddingTop: spacing(8),
  },
  header: {
    marginBottom: spacing(8),
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing(2),
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    color: colors.mutedText,
    textAlign: 'center',
    lineHeight: 24,
  },
  inputContainer: {
    marginBottom: spacing(4),
  },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.cardBg,
    marginBottom: spacing(3),
    minHeight: 44,
  },
  findButton: {
    backgroundColor: colors.coachPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  findButtonDisabled: {
    backgroundColor: colors.mutedText,
  },
  findButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  findButtonTextDisabled: {
    color: colors.cardBg,
  },
  errorContainer: {
    backgroundColor: colors.danger + '10',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing(3),
    marginBottom: spacing(4),
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  successContainer: {
    backgroundColor: colors.success + '10',
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(3),
    justifyContent: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(2),
  },
  avatarText: {
    fontSize: 20,
  },
  usernameText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  continueButton: {
    backgroundColor: colors.success,
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  continueButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  skipContainer: {
    marginTop: 'auto',
    paddingBottom: spacing(6),
  },
  skipButton: {
    paddingVertical: spacing(3),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  skipButtonText: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '500',
  },
});
