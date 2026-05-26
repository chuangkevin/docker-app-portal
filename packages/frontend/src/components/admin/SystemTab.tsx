import { useState, useMemo, useEffect } from 'react'
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
  getOpenCodeSettings,
  saveOpenCodeSettings,
  clearOpenCodeSettings,
  getOpenCodeModels,
} from '../../api/admin'
import type { ApiKeyInfo, OpenCodeModelGroup } from '../../api/admin'

const OC_SOURCE_LABEL: Record<string, string> = {
  db: '設定',
  env: '環境變數',
  none: '未設定',
  default: '預設',
}

export default function SystemTab() {
  const queryClient = useQueryClient()
  const [keysInput, setKeysInput] = useState('')
  const [keySearch, setKeySearch] = useState('')
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  // OpenCode state
  const [ocServersInput, setOcServersInput] = useState('')
  const [ocModelSel, setOcModelSel] = useState('')
  const [ocModelSearch, setOcModelSearch] = useState('')
  const [ocMsg, setOcMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const { data: apiKeys, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
  })

  const { data: usage } = useQuery({
    queryKey: ['token-usage'],
    queryFn: getTokenUsage,
  })

  const { data: ocSettings } = useQuery({
    queryKey: ['opencode-settings'],
    queryFn: getOpenCodeSettings,
  })

  const { data: ocModels, refetch: refetchModels } = useQuery({
    queryKey: ['opencode-models'],
    queryFn: getOpenCodeModels,
    enabled: false,
  })

  useEffect(() => {
    if (ocSettings) {
      setOcServersInput(ocSettings.servers)
      if (ocSettings.text_model_source === 'db') {
        setOcModelSel(ocSettings.text_model)
      }
    }
  }, [ocSettings])

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

  const ocSaveMutation = useMutation({
    mutationFn: () => saveOpenCodeSettings(ocServersInput, ocModelSel || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opencode-settings'] })
      setOcMsg({ text: 'OpenCode 設定已儲存', type: 'ok' })
      setTimeout(() => setOcMsg(null), 3000)
    },
    onError: () => {
      setOcMsg({ text: '儲存失敗', type: 'err' })
      setTimeout(() => setOcMsg(null), 3000)
    },
  })

  const ocClearMutation = useMutation({
    mutationFn: clearOpenCodeSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opencode-settings'] })
      setOcServersInput('')
      setOcModelSel('')
      setOcMsg({ text: '已清除 DB 設定，回到環境變數', type: 'ok' })
      setTimeout(() => setOcMsg(null), 3000)
    },
    onError: () => {
      setOcMsg({ text: '清除失敗', type: 'err' })
      setTimeout(() => setOcMsg(null), 3000)
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

  const filteredOcGroups = useMemo(() => {
    if (!ocModels?.groups) return []
    const q = ocModelSearch.toLowerCase().trim()
    if (!q) return ocModels.groups
    return ocModels.groups
      .map((g: OpenCodeModelGroup) => ({
        ...g,
        models: g.models.filter(
          (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.models.length > 0)
  }, [ocModels, ocModelSearch])

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

      {/* OpenCode AI Settings */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-white font-semibold text-lg mb-4">OpenCode AI 設定</h2>

        {/* Current status */}
        {ocSettings && (
          <div className="grid grid-cols-[5rem_1fr] gap-y-1 mb-4 text-sm">
            <span className="text-slate-500">伺服器</span>
            <span className="text-slate-300 font-mono text-xs truncate">
              {ocSettings.servers.split('\n')[0] || '—'}
              {ocSettings.servers.split('\n').filter((s) => s.trim()).length > 1 &&
                ` +${ocSettings.servers.split('\n').filter((s) => s.trim()).length - 1}`}
              <span className="text-slate-600 ml-1">[{OC_SOURCE_LABEL[ocSettings.servers_source]}]</span>
            </span>
            <span className="text-slate-500">文字模型</span>
            <span className="text-slate-300 font-mono text-xs truncate">
              {ocSettings.text_model}
              <span className="text-slate-600 ml-1">[{OC_SOURCE_LABEL[ocSettings.text_model_source]}]</span>
            </span>
          </div>
        )}

        {/* Servers textarea */}
        <label className="block text-xs text-slate-400 mb-1">OPENCODE 伺服器（一行一個 URL）</label>
        <textarea
          value={ocServersInput}
          onChange={(e) => setOcServersInput(e.target.value)}
          rows={3}
          placeholder="http://opencode-server:4096"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm font-mono resize-y mb-4"
        />

        {/* Model search + refresh */}
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-slate-400 shrink-0">搜尋模型</label>
          <input
            type="text"
            value={ocModelSearch}
            onChange={(e) => setOcModelSearch(e.target.value)}
            placeholder="gpt / gemini / ..."
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
          />
          <button
            type="button"
            onClick={() => void refetchModels()}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 text-slate-300 transition whitespace-nowrap"
          >
            重新整理模型
          </button>
        </div>

        {/* Model select */}
        <select
          value={ocModelSel}
          onChange={(e) => setOcModelSel(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition text-sm mb-3"
        >
          <option value="">
            — 使用預設（{ocSettings?.text_model || 'opencode/deepseek-v4-flash-free'}）—
          </option>
          {filteredOcGroups.map((g) => (
            <optgroup key={g.provider} label={`${g.name}${g.authed ? '' : ' (需授權)'}`}>
              {g.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.free ? ' [free]' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Models fetch error */}
        {ocModels && ocModels.groups.length === 0 && ocServersInput.trim() && (
          <p className="text-yellow-400 text-xs mb-3">
            All {ocServersInput.split('\n').filter((s) => s.trim()).length} OpenCode server(s) failed or returned no models
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => ocSaveMutation.mutate()}
            disabled={ocSaveMutation.isPending || ocClearMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ocSaveMutation.isPending ? '儲存中...' : '儲存 OpenCode 設定'}
          </button>
          <button
            type="button"
            onClick={() => ocClearMutation.mutate()}
            disabled={ocSaveMutation.isPending || ocClearMutation.isPending || ocSettings?.servers_source !== 'db'}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-600 hover:bg-slate-700 text-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ocClearMutation.isPending ? '清除中...' : '清除 DB 設定'}
          </button>
          {ocMsg && (
            <span className={`text-sm ${ocMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {ocMsg.text}
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
