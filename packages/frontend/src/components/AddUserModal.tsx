import React, { useState, useRef, useEffect } from 'react'

interface AddUserModalProps {
  onConfirm: (username: string) => Promise<void>
  onClose: () => void
  error?: string | null
}

const AddUserModal: React.FC<AddUserModalProps> = ({
  onConfirm,
  onClose,
  error,
}) => {
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    setIsLoading(true)
    try {
      await onConfirm(username.trim())
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
        <h2 className="text-white text-xl font-semibold mb-2">新增使用者</h2>
        <p className="text-slate-400 text-sm mb-6">輸入新使用者的名稱</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="使用者名稱"
              maxLength={50}
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
              disabled={isLoading || !username.trim()}
              className="flex-1 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? '建立中...' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddUserModal
