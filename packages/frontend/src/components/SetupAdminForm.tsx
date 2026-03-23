import React, { useState } from 'react'

interface SetupAdminFormProps {
  onSubmit: (username: string, password: string) => Promise<void>
  error?: string | null
}

const SetupAdminForm: React.FC<SetupAdminFormProps> = ({ onSubmit, error }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!username.trim()) {
      setLocalError('請輸入使用者名稱')
      return
    }
    if (password.length < 6) {
      setLocalError('密碼至少需要 6 個字元')
      return
    }
    if (password !== confirmPassword) {
      setLocalError('兩次密碼不一致')
      return
    }

    setIsLoading(true)
    try {
      await onSubmit(username.trim(), password)
    } finally {
      setIsLoading(false)
    }
  }

  const displayError = localError ?? error

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h1 className="text-white text-2xl font-bold">建立管理員帳號</h1>
        <p className="text-slate-400 text-sm mt-2">
          這是您的第一次設定，請建立管理員帳號
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-slate-300 text-sm mb-1.5">
            使用者名稱
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            maxLength={50}
            className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-slate-300 text-sm mb-1.5">密碼</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 個字元"
            className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-slate-300 text-sm mb-1.5">
            確認密碼
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次輸入密碼"
            className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700"
            disabled={isLoading}
          />
        </div>

        {displayError && (
          <p className="text-red-400 text-sm text-center">{displayError}</p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium mt-2"
        >
          {isLoading ? '建立中...' : '建立帳號'}
        </button>
      </form>
    </div>
  )
}

export default SetupAdminForm
