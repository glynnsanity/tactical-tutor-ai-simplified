import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform, Linking, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Try importing components one by one to isolate the issue
console.log('[AskCoach] Step 1: Basic imports done');

import { colors, radii } from '../theme';
console.log('[AskCoach] Step 2: Theme imported');

import { Button } from '../components/ui/Button';
console.log('[AskCoach] Step 3: Button imported');

import AsyncStorage from '@react-native-async-storage/async-storage';
console.log('[AskCoach] Step 4: AsyncStorage imported');

// Import with try-catch to isolate issues
let ScreenHeader: any = null;
try {
  const headerModule = require('../components/ScreenHeader');
  ScreenHeader = headerModule.ScreenHeader;
  console.log('[AskCoach] Step 5: ScreenHeader imported');
} catch (e) {
  console.error('[AskCoach] Error importing ScreenHeader:', e);
}

let MarkdownMessage: any = null;
try {
  MarkdownMessage = require('../components/MarkdownMessage').default;
  console.log('[AskCoach] Step 6: MarkdownMessage imported');
} catch (e) {
  console.error('[AskCoach] Error importing MarkdownMessage:', e);
}

let Crown: any = () => null;
let Loader: any = () => null;
try {
  const lucide = require('lucide-react-native');
  Crown = lucide.Crown;
  Loader = lucide.Loader;
  console.log('[AskCoach] Step 7: Lucide icons imported');
} catch (e) {
  console.error('[AskCoach] Error importing lucide icons:', e);
}

import { ask, poll } from '../lib/api';
console.log('[AskCoach] Step 8: API imported');

type MessageRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: MessageRole;
  text: string;
};

const WELCOME_MESSAGE: ChatMessage = { 
  id: 'welcome', 
  role: 'assistant', 
  text: 'Hi! I\'m your chess coach. Ask me about positions, plans, or mistakes.' 
};

const MAX_MESSAGE_LENGTH = 2000;
const POLL_TIMEOUT_MS = 30000; // 30 second timeout for poll requests
const SCROLL_SAVE_DELAY = 300; // Debounce scroll position saves

console.log('[AskCoach] Module evaluation complete. About to export component');

function AskCoach(props: any) {
  console.log('[AskCoach] ===== FUNCTION CALLED - COMPONENT STARTING =====');
  console.log('[AskCoach] Props received:', props);
  console.log('[AskCoach] Props keys:', props ? Object.keys(props) : 'null');
  
  console.log('[AskCoach] About to call useState for messages');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  console.log('[AskCoach] useState messages called successfully, messages length:', messages.length);
  
  console.log('[AskCoach] About to call useState for input');
  const [input, setInput] = useState('');
  console.log('[AskCoach] useState input called successfully');
  
  console.log('[AskCoach] About to call useState for isTyping');
  const [isTyping, setIsTyping] = useState(false);
  console.log('[AskCoach] useState isTyping called successfully');
  
  console.log('[AskCoach] About to create refs');
  const scrollRef = useRef<ScrollView | null>(null);
  const pollRef = useRef<{ cancel: () => void } | null>(null);
  const activeTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const canSend = useMemo(() => input.trim().length > 0, [input]);
  const charCount = input.length;
  const isNearLimit = charCount > MAX_MESSAGE_LENGTH * 0.8;

  // Load messages from AsyncStorage on mount
  useEffect(() => {
    console.log('[AskCoach] Component mounted');
    console.log('[AskCoach] Loading messages from storage');
    const loadMessages = async () => {
      try {
        const saved = await AsyncStorage.getItem('chatMessages');
        if (saved) {
          const parsed = JSON.parse(saved);
          setMessages(parsed);
          console.log('[AskCoach] Loaded', parsed.length, 'messages');
        }
        
        // Restore scroll position after messages load
        const scrollPos = await AsyncStorage.getItem('chatScrollPosition');
        if (scrollPos) {
          const position = parseInt(scrollPos, 10);
          setTimeout(() => {
            scrollRef.current?.scrollTo({ y: position, animated: false });
          }, 100);
        }
      } catch (error) {
        console.error('Failed to load chat messages:', error);
      }
    };

    loadMessages();
  }, []); // Only run once on mount

  // Save messages to AsyncStorage whenever they change
  useEffect(() => {
    const saveMessages = async () => {
      try {
        // Don't save if only welcome message
        if (messages.length > 1) {
          await AsyncStorage.setItem('chatMessages', JSON.stringify(messages));
        }
      } catch (error) {
        console.error('Failed to save chat messages:', error);
      }
    };

    saveMessages();
  }, [messages]); // Save whenever messages change

  // Save scroll position with debouncing
  const handleScroll = (event: any) => {
    // Extract the offset synchronously before the async callback
    const yOffset = event?.nativeEvent?.contentOffset?.y;
    
    // Safety check
    if (typeof yOffset !== 'number') {
      return;
    }

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Now use the extracted value in the async callback
    scrollTimeoutRef.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem('chatScrollPosition', String(yOffset));
      } catch (error) {
        console.error('Failed to save scroll position:', error);
      }
    }, SCROLL_SAVE_DELAY);
  };

  // Cleanup all timeouts and refs on unmount
  useEffect(() => {
    return () => {
      // Clear all active timeouts
      activeTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      activeTimeoutsRef.current.clear();
      
      // Clear scroll timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Cancel polling
      if (pollRef.current) {
        pollRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom whenever messages change
    const timeout = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
    activeTimeoutsRef.current.add(timeout);
    return () => {
      clearTimeout(timeout);
      activeTimeoutsRef.current.delete(timeout);
    };
  }, [messages]);

  const onSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // If a stream is ongoing, cancel it
    if (pollRef.current) {
      pollRef.current.cancel();
      pollRef.current = null;
      setIsTyping(false);
    }

    const userMsg: ChatMessage = { id: `m_${Date.now()}_u`, role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    Keyboard.dismiss(); // Dismiss keyboard after sending

    // Seed assistant placeholder message
    const assistantId = `m_${Date.now()}_a`;
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', text: '' };
    setMessages(prev => [...prev, assistantMsg]);
    setIsTyping(true);

    // Call server to create a job, then poll for tokens
    const savedUserId = (await AsyncStorage.getItem('chesscom.username')) || undefined;
    ask(trimmed, savedUserId)
      .then(({ jobId }) => {
        startPolling(jobId, assistantId);
      })
      .catch(() => {
        setIsTyping(false);
        setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, text: 'Sorry—something went wrong starting the reply.' } : m)));
      });
  };

  function startPolling(jobId: string, assistantId: string) {
    let cancelled = false;
    let cursor = 0;
    let buffer: string[] = [];
    const intervalMs = 220;
    let pollAttempts = 0;
    const maxAttempts = Math.ceil(POLL_TIMEOUT_MS / 180); // Max polling attempts before timeout

    pollRef.current = { cancel: () => { cancelled = true; } };

    const step = async () => {
      if (cancelled) return;
      
      pollAttempts++;
      if (pollAttempts > maxAttempts) {
        setIsTyping(false);
        setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, text: (m.text || '') + '\n\n(Response timed out. Please try again.)' } : m)));
        try { clearInterval(flushId); } catch {}
        pollRef.current = null;
        return;
      }
      
      try {
        // Add timeout to fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout per request
        activeTimeoutsRef.current.add(timeoutId);
        
        const res = await Promise.race([
          poll(jobId, cursor),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Poll request timeout')), 10000)
          ) as Promise<any>
        ]);
        
        clearTimeout(timeoutId);
        activeTimeoutsRef.current.delete(timeoutId);
        
        if (cancelled) return;
        if (res.tokens.length > 0) {
          // Push tokens into buffer; UI flush is throttled by interval
          for (const t of res.tokens) buffer.push(t);
        }
        cursor = res.nextCursor;
        if (res.done) {
          // Final flush
          if (buffer.length > 0) {
            const finalChunk = buffer.join('');
            buffer = [];
            setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, text: (m.text || '') + finalChunk } : m)));
          }
          setIsTyping(false);
          try { clearInterval(flushId); } catch {}
          pollRef.current = null;
          return;
        }
        
        const nextTimeout = setTimeout(step, 180);
        activeTimeoutsRef.current.add(nextTimeout);
      } catch (e) {
        // Stop on error for now
        setIsTyping(false);
        try { clearInterval(flushId); } catch {}
        pollRef.current = null;
      }
    };

    // Throttled flush interval
    const flushId = setInterval(() => {
      if (cancelled) return;
      if (buffer.length === 0) return;
      const chunk = buffer.join('');
      buffer = [];
      setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, text: (m.text || '') + chunk } : m)));
    }, intervalMs);

    // Kick off polling
    step();

    // Ensure cleanup of interval when cancelled
    const prevCancel = pollRef.current?.cancel;
    pollRef.current = {
      cancel: () => {
        cancelled = true;
        try { clearInterval(flushId); } catch {}
        prevCancel && prevCancel();
      }
    };
  }

  const renderMessage = (m: ChatMessage) => {
    const isUser = m.role === 'user';
    return (
      <View key={m.id} style={{ width: '100%', marginBottom: 12, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <View
          style={{
            maxWidth: '85%',
            backgroundColor: isUser ? colors.coachPrimary : colors.secondaryBg,
            borderWidth: isUser ? 0 : 1,
            borderColor: isUser ? 'transparent' : colors.cardBorder,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: radii.lg,
            borderBottomRightRadius: isUser ? 4 : radii.lg,
            borderBottomLeftRadius: isUser ? radii.lg : 4,
          }}
        >
          {isUser ? (
            <Text style={{ color: '#ffffff', fontSize: 15, lineHeight: 20 }}>
              {m.text}
            </Text>
          ) : (
            MarkdownMessage ? (
              <MarkdownMessage text={m.text} />
            ) : (
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 20 }}>
                {m.text}
              </Text>
            )
          )}
        </View>
      </View>
    );
  };


  console.log('[AskCoach] About to return JSX');
  console.log('[AskCoach] About to render SafeAreaView');
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {(() => {
        console.log('[AskCoach] SafeAreaView rendered');
        return null;
      })()}
      {ScreenHeader ? (
        <ScreenHeader title="Ask Your Coach" subtitle="Personalized guidance from your games" LeftIcon={Crown} />
      ) : (
        <View style={{ padding: 24, backgroundColor: colors.headerBg }}>
          <Text style={{ color: 'white' }}>Header not loaded</Text>
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={(ref) => { scrollRef.current = ref; }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map(renderMessage)}
            {isTyping && (
              <View style={{ width: '100%', marginBottom: 12, alignItems: 'flex-start' }}>
                <View
                  style={{
                    maxWidth: '85%',
                    backgroundColor: colors.secondaryBg,
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: radii.lg,
                    borderBottomLeftRadius: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Loader 
                    size={20} 
                    color={colors.coachPrimary}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginBottom: 4 }}>
                      Coach is analyzing…
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View
            style={{
              borderTopWidth: 1,
              borderColor: colors.cardBorder,
              backgroundColor: colors.background,
              padding: 12,
            }}
          >
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: charCount > 0 ? colors.mutedText : 'transparent' }}>
                {charCount} / {MAX_MESSAGE_LENGTH}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask about a position, plan, or mistake…"
                placeholderTextColor={colors.mutedText}
                accessibilityLabel="Coach question input"
                accessibilityHint="Type your chess question here (max 2000 characters)"
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: isNearLimit ? colors.warning : colors.cardBorder,
                  borderRadius: radii.md,
                  marginRight: 8,
                  color: colors.text,
                }}
                multiline
                maxLength={MAX_MESSAGE_LENGTH}
              />
              <Button onPress={onSend} disabled={!canSend || isTyping} variant="gold" size="md">
                Send
              </Button>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

console.log('[AskCoach] Component function defined. Exporting as default');
export default AskCoach;
