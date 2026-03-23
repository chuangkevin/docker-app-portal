import React from 'react'
import { useAuthStore } from '../stores/authStore'

const HomePage: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>

        <h1 className="text-white text-3xl font-bold mb-3">Docker App Portal</h1>

        {currentUser && (
          <p className="text-slate-400 text-lg mb-2">
            歡迎，<span className="text-blue-400 font-medium">{currentUser.username}</span>
          </p>
        )}

        <div className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full px-4 py-2 mt-4">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-slate-300 text-sm font-medium">即將推出</span>
        </div>

        <p className="text-slate-500 text-sm mt-6">
          此功能正在開發中，敬請期待。
        </p>

        <button
          onClick={clearAuth}
          className="mt-8 px-6 py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors duration-200 text-sm"
        >
          切換使用者
        </button>
      </div>
    </div>
  )
}

export default HomePage
