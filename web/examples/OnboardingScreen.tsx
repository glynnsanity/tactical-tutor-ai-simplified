/**
 * Onboarding Screen with Parallel Analysis
 *
 * This screen demonstrates the "parallel process" UX where:
 * 1. User enters their Chess.com username
 * 2. Analysis starts in background
 * 3. User can immediately start chatting
 * 4. Progress bar shows analysis status
 * 5. Chat responses include confidence indicators
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAnalysisProgress } from './useAnalysisProgress';
import { AnalysisProgressBar } from './AnalysisProgressBar';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: 'limited' | 'partial' | 'good' | 'full';
}

export function OnboardingScreen() {
  // Username input state
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Analysis progress
  const {
    progress,
    isAnalyzing,
    isComplete,
    error,
    startAnalysis,
    checkStatus,
  } = useAnalysisProgress(userId || '');

  const scrollViewRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  /**
   * Start the analysis process
   */
  const handleStart = async () => {
    if (!username.trim()) return;

    setIsStarting(true);
    const newUserId = `chesscom-${username.toLowerCase().trim()}`;
    setUserId(newUserId);

    // Add welcome message
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: `Welcome! I'm analyzing your games from Chess.com. You can start asking questions right away - my answers will get more detailed as I process more of your games.`,
      },
    ]);

    // Start analysis
    startAnalysis(username.trim(), 500);
    setIsStarting(false);
  };

  /**
   * Send a chat message
   */
  const handleSend = async () => {
    if (!inputText.trim() || !userId || isSending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsSending(true);

    try {
      // Create job
      const jobResponse = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.content,
          userId,
        }),
      });

      const { jobId } = await jobResponse.json();

      // Poll for response
      let response = '';
      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        const pollResponse = await fetch(`${API_BASE}/poll?jobId=${jobId}`);
        const pollData = await pollResponse.json();

        if (pollData.tokens && pollData.tokens.length > 0) {
          response += pollData.tokens.join('');
        }

        if (pollData.done) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      // Determine confidence from response
      let confidence: Message['confidence'] = 'good';
      if (response.includes('[Limited Data]')) {
        confidence = 'limited';
      } else if (response.includes('[Partial Analysis]')) {
        confidence = 'partial';
      } else if (response.includes('[Full Analysis]')) {
        confidence = 'full';
      }

      // Clean up confidence indicators from display text
      const cleanResponse = response
        .replace(/\[Limited Data\]/g, '')
        .replace(/\[Partial Analysis\]/g, '')
        .replace(/\[Good Coverage\]/g, '')
        .replace(/\[Full Analysis\]/g, '')
        .trim();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanResponse,
        confidence,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Render confidence badge
   */
  const renderConfidenceBadge = (confidence?: Message['confidence']) => {
    if (!confidence || confidence === 'full') return null;

    const badges = {
      limited: { text: 'Limited Data', color: '#ef4444', bg: '#fef2f2' },
      partial: { text: 'Partial Analysis', color: '#f59e0b', bg: '#fffbeb' },
      good: { text: 'Good Coverage', color: '#22c55e', bg: '#f0fdf4' },
    };

    const badge = badges[confidence];
    if (!badge) return null;

    return (
      <View style={[styles.confidenceBadge, { backgroundColor: badge.bg }]}>
        <Text style={[styles.confidenceBadgeText, { color: badge.color }]}>
          {badge.text}
        </Text>
      </View>
    );
  };

  // Username input screen
  if (!userId) {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeContainer}>
          <Text style={styles.title}>Chess Coach AI</Text>
          <Text style={styles.subtitle}>
            Get personalized coaching based on your Chess.com games
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Chess.com Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your username"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.startButton, !username.trim() && styles.startButtonDisabled]}
            onPress={handleStart}
            disabled={!username.trim() || isStarting}
          >
            {isStarting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Start Analysis</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            We'll analyze up to 500 of your recent games. You can start chatting
            immediately while analysis continues in the background.
          </Text>
        </View>
      </View>
    );
  }

  // Main chat screen with progress
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress bar (shown while analyzing) */}
      {progress && (isAnalyzing || (isComplete && progress.gamesAnalyzed > 0)) && (
        <AnalysisProgressBar progress={progress} showDetails={isAnalyzing} />
      )}

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.role === 'user' ? styles.userMessage : styles.assistantMessage,
            ]}
          >
            {message.role === 'assistant' && renderConfidenceBadge(message.confidence)}
            <Text
              style={[
                styles.messageText,
                message.role === 'user' && styles.userMessageText,
              ]}
            >
              {message.content}
            </Text>
          </View>
        ))}

        {isSending && (
          <View style={[styles.messageBubble, styles.assistantMessage]}>
            <ActivityIndicator size="small" color="#64748b" />
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask me about your chess games..."
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isSending}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
  },
  startButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  startButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    padding: 12,
    margin: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  confidenceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  confidenceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    backgroundColor: '#f8fafc',
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
