'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import { ChessBoard } from './ChessBoard'
import { User, Bot } from 'lucide-react'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user'

  // Parse content for [BOARD:fen] tags
  const parts = parseContentWithBoards(content)

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-coach-primary' : 'bg-coach-accent'
        }`}
      >
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-gray-900" />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-coach-primary text-white rounded-br-md'
            : 'bg-white border border-gray-200 rounded-bl-md shadow-sm'
        }`}
      >
        {parts.map((part, i) => {
          if (part.type === 'board') {
            return (
              <div key={i} className="my-3 flex justify-center">
                <ChessBoard fen={part.fen} size={240} />
              </div>
            )
          }
          return (
            <div key={i} className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
              <ReactMarkdown
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={isUser ? 'text-sky-200 underline' : 'text-coach-primary underline'}
                    >
                      {children}
                    </a>
                  ),
                  p: ({ children }) => <p className="my-1">{children}</p>,
                }}
              >
                {part.text}
              </ReactMarkdown>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type ContentPart = { type: 'text'; text: string } | { type: 'board'; fen: string }

function parseContentWithBoards(content: string): ContentPart[] {
  // Match [BOARD:fen] or [POSITION:fen] tags
  const boardRegex = /\[(BOARD|POSITION):([^\]]+)\]/gi
  const parts: ContentPart[] = []
  let lastIndex = 0
  let match

  while ((match = boardRegex.exec(content)) !== null) {
    // Add text before the board
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim()
      if (text) {
        parts.push({ type: 'text', text })
      }
    }
    // Add the board
    parts.push({ type: 'board', fen: match[2] })
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim()
    if (text) {
      parts.push({ type: 'text', text })
    }
  }

  // If no boards found, return just the text
  if (parts.length === 0) {
    parts.push({ type: 'text', text: content })
  }

  return parts
}

export default ChatMessage
