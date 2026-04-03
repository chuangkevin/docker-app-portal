import { useState, useMemo } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getApiKeys,
  addApiKeys,
  deleteApiKey,
  getTokenUsage,
} from '../../api/admin'
import type { ApiKeyInfo } from '../../api/admin'

export default function SystemTab() {
  const queryClient = useQueryClient()
  const [keysInput, setKeysInput] = useState('')
  const [keySearch, setKeySearch] = useState('')
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const { data: apiKeys, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
  })

  const { data: usage } = useQuery({
    queryKey: ['token-usage'],
    queryFn: getTokenUsage,
  })

  const addMutation = useMutation({
    mutationFn: (keys: string) => addApiKeys(keys),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      queryClient.invalidateQueries({ queryKey: ['token-usage'] })
      setKeysInput('')
      setMsg({ text: `新增 ${result.added} 個 key（共 ${result.total} 個）`, type: 'ok' })
      setTimeout(() => setMsg(null), 3000)
    },
    onError: () => {
      setMsg({ text: '新增失敗', type: 'err' })
      setTimeout(() => setMsg(null), 3000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (suffix: string) => deleteApiKey(suffix),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const handleAdd = () => {
    if (!keysInput.trim()) return
    addMutation.mutate(keysInput)
  }

  const filteredKeys = useMemo(() => {
    if (!apiKeys?.keys) return []
    const term = keySearch.toLowerCase().trim()
    if (!term) return apiKeys.keys
    return apiKeys.keys.filter((k: ApiKeyInfo) =>
      k.suffix.toLowerCase().includes(term)
    )
  }, [apiKeys, keySearch])

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="space-y-6">
      {/* API Key Pool */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Gemini API Keys</h2>
          {apiKeys?.keys && apiKeys.keys.length > 3 && (
            <input
              type="text"
              placeholder="搜尋 Key..."
              value={keySearch}
              onChange={(e) => setKeySearch(e.target.value)}
              className="w-40 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
            />
          )}
        </div>

        {/* Key list */}
        {keysLoading ? (
          <p className="text-slate-500 text-sm mb-4">載入中...</p>
        ) : filteredKeys.length > 0 ? (
          <div className="space-y-2 mb-4">
            {filteredKeys.map((k: ApiKeyInfo) => (
              <div
                key={k.suffix}
                className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <code className="text-slate-300 text-sm font-mono">
                    ...{k.suffix}
                  </code>
                  <span className="text-slate-500 text-xs">
                    今日 {k.todayCalls} 次 / {formatTokens(k.todayTokens)} tokens
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(k.suffix)}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-yellow-400 text-sm mb-4">
            尚未設定 API Key，請在下方貼上。
          </p>
        )}

        {/* Batch add textarea */}
        <textarea
          placeholder="貼上一個或多個 Gemini API Key（每行一個，自動辨識 AIza 開頭的 key）..."
          value={keysInput}
          onChange={(e) => setKeysInput(e.target.value)}
          rows={4}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm font-mono resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!keysInput.trim() || addMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? '新增中...' : '新增 Key'}
          </button>
          {msg && (
            <span className={`text-sm ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </section>

      {/* Token Usage Stats */}
      {usage && (
        <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-white font-semibold text-lg mb-4">
            Token 用量統計
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">今日</p>
              <p className="text-white text-2xl font-bold">{usage.today.calls}</p>
              <p className="text-slate-500 text-xs">{formatTokens(usage.today.tokens)} tokens</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">本週</p>
              <p className="text-white text-2xl font-bold">{usage.week.calls}</p>
              <p className="text-slate-500 text-xs">{formatTokens(usage.week.tokens)} tokens</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">本月</p>
              <p className="text-white text-2xl font-bold">{usage.month.calls}</p>
              <p className="text-slate-500 text-xs">{formatTokens(usage.month.tokens)} tokens</p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
