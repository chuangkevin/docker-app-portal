import { create } from 'zustand'

interface CurrentUser {
  id: number
  username: string
  role: 'admin' | 'user'
}

interface AuthState {
  accessToken: string | null
  currentUser: CurrentUser | null
  isAuthReady: boolean
  setAuth: (token: string, user: CurrentUser) => void
  hydrateFromToken: (token: string) => void
  markAuthReady: () => void
  clearAuth: () => void
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split('.')
  if (!payload) {
    throw new Error('Invalid token payload')
  }

  const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
  const paddedPayload = normalizedPayload.padEnd(
    normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
    '='
  )

  return JSON.parse(atob(paddedPayload)) as {
    userId: number
    username: string
    role: 'admin' | 'user'
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  currentUser: null,
  isAuthReady: false,
  setAuth: (token, user) =>
    set({ accessToken: token, currentUser: user, isAuthReady: true }),
  hydrateFromToken: (token) => {
    const payload = decodeJwtPayload(token)
    set({
      accessToken: token,
      currentUser: {
        id: payload.userId,
        username: payload.username,
        role: payload.role,
      },
      isAuthReady: true,
    })
  },
  markAuthReady: () => set({ isAuthReady: true }),
  clearAuth: () => set({ accessToken: null, currentUser: null, isAuthReady: true }),
}))
