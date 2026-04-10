import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SelectPage from './pages/SelectPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'
import TabLayout from './components/TabLayout'
import { refreshToken } from './api/auth'
import { useAuthStore } from './stores/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: false,
    },
  },
})

function AuthBootstrap() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const isAuthReady = useAuthStore((state) => state.isAuthReady)
  const hydrateFromToken = useAuthStore((state) => state.hydrateFromToken)
  const markAuthReady = useAuthStore((state) => state.markAuthReady)

  useEffect(() => {
    if (isAuthReady) {
      return
    }

    if (accessToken) {
      markAuthReady()
      return
    }

    let cancelled = false

    const restoreSession = async () => {
      try {
        const { accessToken: nextAccessToken } = await refreshToken()
        if (!cancelled) {
          hydrateFromToken(nextAccessToken)
        }
      } catch {
        if (!cancelled) {
          markAuthReady()
        }
      }
    }

    restoreSession()

    return () => {
      cancelled = true
    }
  }, [accessToken, hydrateFromToken, isAuthReady, markAuthReady])

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">檢查登入狀態中...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/select" element={<SelectPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <TabLayout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/select" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBootstrap />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
