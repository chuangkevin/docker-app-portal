import { create } from 'zustand'

interface CurrentUser {
  id: number
  username: string
  role: 'admin' | 'user'
}

interface AuthState {
  accessToken: string | null
  currentUser: CurrentUser | null
  setAuth: (token: string, user: CurrentUser) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  currentUser: null,
  setAuth: (token, user) => set({ accessToken: token, currentUser: user }),
  clearAuth: () => set({ accessToken: null, currentUser: null }),
}))
