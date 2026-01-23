'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/Button'
import { validateChessComUser, ingestChessCom } from '@/lib/api'
import { storage, STORAGE_KEYS } from '@/lib/storage'

type Status = 'idle' | 'validating' | 'valid' | 'invalid' | 'ingesting' | 'error'

export default function OnboardingPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [progress, setProgress] = useState('')

  const handleValidate = async () => {
    if (!username.trim()) return

    setStatus('validating')
    setErrorMessage('')

    try {
      const result = await validateChessComUser(username.trim())

      if (result.valid) {
        setStatus('valid')
      } else {
        setStatus('invalid')
        setErrorMessage('Username not found on Chess.com')
      }
    } catch {
      setStatus('error')
      setErrorMessage('Could not connect to Chess.com. Check your internet connection.')
    }
  }

  const handleGetStarted = async () => {
    if (status !== 'valid') return

    setStatus('ingesting')
    setProgress('Fetching your games from Chess.com...')

    try {
      // Generate a userId
      const userId = `user-${Date.now()}`

      setProgress('Analyzing your recent games...')
      const result = await ingestChessCom(username.trim(), userId, {
        quickStart: true,
        quickStartGames: 10,
        limitGames: 100,
      })

      // Save to storage
      storage.set(STORAGE_KEYS.USER_ID, userId)
      storage.set(STORAGE_KEYS.CHESS_COM_USERNAME, username.trim())
      storage.set(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')

      setProgress(`Analyzed ${result.added} games! Redirecting...`)

      // Navigate to chat
      setTimeout(() => {
        router.push('/chat')
      }, 1000)
    } catch (err) {
      setStatus('error')
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to import games. Please try again.'
      )
    }
  }

  const handleSkip = () => {
    storage.set(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    router.push('/chat')
  }

  const isValidUsername = username.trim().length >= 3

  return (
    <div className="min-h-screen bg-gradient-to-b from-header-bg to-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-coach-accent mb-4">
            <span className="text-4xl">♔</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Chess Coach</h1>
          <p className="text-gray-400">AI-powered analysis of your games</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Connect your Chess.com account
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            Enter your Chess.com username to import your games and get personalized coaching.
          </p>

          {/* Username input */}
          <div className="relative mb-4">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setStatus('idle')
                setErrorMessage('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValidUsername && status === 'idle') {
                  handleValidate()
                }
              }}
              placeholder="Chess.com username"
              className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-coach-primary focus:border-transparent"
              disabled={status === 'validating' || status === 'ingesting'}
            />
            {/* Status icon */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {status === 'validating' && (
                <Loader2 className="w-5 h-5 text-coach-primary animate-spin" />
              )}
              {status === 'valid' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {status === 'invalid' && <XCircle className="w-5 h-5 text-red-500" />}
            </div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <p className="text-red-600 text-sm mb-4">{errorMessage}</p>
          )}

          {/* Progress message */}
          {status === 'ingesting' && progress && (
            <div className="flex items-center gap-2 text-coach-primary text-sm mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progress}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            {status !== 'valid' && status !== 'ingesting' ? (
              <Button
                onClick={handleValidate}
                disabled={!isValidUsername || status === 'validating'}
                loading={status === 'validating'}
                className="w-full"
                size="lg"
              >
                Find my account
              </Button>
            ) : status === 'valid' ? (
              <Button
                onClick={handleGetStarted}
                variant="gold"
                className="w-full"
                size="lg"
              >
                <span>Get Started</span>
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            ) : (
              <Button disabled loading className="w-full" size="lg">
                Importing games...
              </Button>
            )}

            <button
              onClick={handleSkip}
              disabled={status === 'ingesting'}
              className="w-full text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-6">
          Your games are analyzed locally and never shared.
        </p>
      </div>
    </div>
  )
}
