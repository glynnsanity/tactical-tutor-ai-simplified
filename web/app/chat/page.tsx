'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Settings } from 'lucide-react'
import { ChatMessage } from '@/components/ChatMessage'
import { ask, poll } from '@/lib/api'
import { storage, STORAGE_KEYS } from '@/lib/storage'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Load saved messages and userId on mount
  useEffect(() => {
    const saved = storage.getJSON<Message[]>(STORAGE_KEYS.CHAT_MESSAGES)
    if (saved && saved.length > 0) {
      setMessages(saved)
    }
    setUserId(storage.get(STORAGE_KEYS.USER_ID))
  }, [])

  // Save messages when they change
  useEffect(() => {
    if (messages.length > 0) {
      storage.setJSON(STORAGE_KEYS.CHAT_MESSAGES, messages)
    }
  }, [messages])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    const question = input.trim()
    if (!question || isTyping) return

    // Cancel any existing request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }

    // Add placeholder assistant message
    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setInput('')
    setIsTyping(true)

    try {
      // Start the job
      const { jobId } = await ask(question, userId || undefined)

      // Poll for tokens
      let cursor = 0
      let done = false
      let fullContent = ''

      while (!done) {
        try {
          const res = await poll(jobId, cursor, abortRef.current.signal)

          if (res.tokens.length > 0) {
            fullContent += res.tokens.join('')
            // Update the assistant message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id ? { ...m, content: fullContent } : m
              )
            )
          }

          cursor = res.nextCursor
          done = res.done

          // Small delay between polls
          if (!done) {
            await new Promise((r) => setTimeout(r, 150))
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            break
          }
          throw err
        }
      }
    } catch (err) {
      console.error('Chat error:', err)
      // Update assistant message with error
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
            : m
        )
      )
    } finally {
      setIsTyping(false)
      abortRef.current = null
    }
  }, [input, isTyping, userId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([])
    storage.remove(STORAGE_KEYS.CHAT_MESSAGES)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-header-bg text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-coach-accent flex items-center justify-center">
            <span className="text-xl">♔</span>
          </div>
          <div>
            <h1 className="font-semibold">Chess Coach</h1>
            <p className="text-xs text-gray-400">Ask me about your games</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="text-gray-400 hover:text-white transition-colors p-2"
          title="Clear chat"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <div className="text-6xl mb-4">♔</div>
            <h2 className="text-xl font-semibold mb-2">Welcome to Chess Coach</h2>
            <p className="text-sm max-w-md mx-auto">
              Ask me about your chess games! I can analyze your openings, find patterns
              in your play, and help you improve.
            </p>
            <div className="mt-6 space-y-2 text-sm text-left max-w-sm mx-auto">
              <p className="text-gray-600 font-medium">Try asking:</p>
              <button
                onClick={() => setInput('What openings do I play most often?')}
                className="block w-full text-left px-3 py-2 bg-white rounded-lg border hover:border-coach-primary transition-colors"
              >
                "What openings do I play most often?"
              </button>
              <button
                onClick={() => setInput('Where do I make the most mistakes?')}
                className="block w-full text-left px-3 py-2 bg-white rounded-lg border hover:border-coach-primary transition-colors"
              >
                "Where do I make the most mistakes?"
              </button>
              <button
                onClick={() => setInput('Show me a game where I played well')}
                className="block w-full text-left px-3 py-2 bg-white rounded-lg border hover:border-coach-primary transition-colors"
              >
                "Show me a game where I played well"
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} role={message.role} content={message.content} />
          ))
        )}

        {/* Typing indicator */}
        {isTyping && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-coach-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-coach-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-coach-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>Coach is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="border-t bg-white p-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your chess games..."
              maxLength={2000}
              rows={1}
              className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 pr-16 focus:outline-none focus:ring-2 focus:ring-coach-primary focus:border-transparent"
              disabled={isTyping}
            />
            <span className="absolute right-3 bottom-3 text-xs text-gray-400">
              {input.length}/2000
            </span>
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="bg-coach-primary text-white rounded-xl px-4 py-3 hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  )
}
