import React, { useState, useRef, useEffect } from 'react'

interface AdminPasswordModalProps {
  username: string
  onConfirm: (password: string) => Promise<void>
  onClose: () => void
  error?: string | null
}

const AdminPasswordModal: React.FC<AdminPasswordModalProps> = ({
  username,
  onConfirm,
  onClose,
  error,
}) => {
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setIsLoading(true)
    try {
      await onConfirm(password)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-slate-800 rounded-xl p-8 w-full max-w-sm shadow-2xl border border-slate-700">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3">
            {username.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-white text-xl font-semibold">{username}</h2>
          <p className="text-slate-400 text-sm mt-1">請輸入管理員密碼</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密碼"
              className="w-full bg-slate-700 text-white placeholder-slate-400 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600"
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors duration-200 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="flex-1 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? '驗證中...' : '確認'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminPasswordModal
