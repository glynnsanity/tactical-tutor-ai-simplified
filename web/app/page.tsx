'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { storage, STORAGE_KEYS } from '@/lib/storage'

export default function HomePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if onboarding is complete
    const onboardingComplete = storage.get(STORAGE_KEYS.ONBOARDING_COMPLETE)

    if (onboardingComplete === 'true') {
      router.replace('/chat')
    } else {
      router.replace('/onboarding')
    }

    setIsLoading(false)
  }, [router])

  // Loading state while checking
  if (isLoading) {
    return (
      <div className="min-h-screen bg-header-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-coach-accent flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">♔</span>
          </div>
          <div className="flex gap-1 justify-center">
            <span className="w-2 h-2 bg-coach-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-coach-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-coach-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  return null
}
