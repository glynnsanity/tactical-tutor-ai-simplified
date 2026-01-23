// localStorage wrapper with SSR safety

export const storage = {
  get(key: string): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(key)
  },

  set(key: string, value: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(key, value)
  },

  remove(key: string): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(key)
  },

  getJSON<T>(key: string): T | null {
    const value = storage.get(key)
    if (!value) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  },

  setJSON<T>(key: string, value: T): void {
    storage.set(key, JSON.stringify(value))
  },
}

// Storage keys
export const STORAGE_KEYS = {
  ONBOARDING_COMPLETE: 'onboardingComplete',
  CHESS_COM_USERNAME: 'chesscom.username',
  USER_ID: 'userId',
  CHAT_MESSAGES: 'chatMessages',
} as const
