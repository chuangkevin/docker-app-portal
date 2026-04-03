import React, { useState, useMemo } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getDomains,
  addDomain,
  removeDomain,
} from '../../api/admin'
import type { DomainBinding } from '../../api/admin'

export default function DomainsTab() {
  const queryClient = useQueryClient()
  const [newSubdomain, setNewSubdomain] = useState('')
  const [newPort, setNewPort] = useState('')
  const [domainSearch, setDomainSearch] = useState('')
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const { data: domains, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: getDomains,
  })

  const addMutation = useMutation({
    mutationFn: ({ subdomain, port }: { subdomain: string; port: number }) =>
      addDomain(subdomain, port),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setNewSubdomain('')
      setNewPort('')
      setMsg({ text: '新增成功，Caddy 正在重新載入...', type: 'ok' })
      setTimeout(() => setMsg(null), 5000)
    },
    onError: () => {
      setMsg({ text: '新增失敗', type: 'err' })
      setTimeout(() => setMsg(null), 3000)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (subdomain: string) => removeDomain(subdomain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setMsg({ text: '刪除成功，Caddy 正在重新載入...', type: 'ok' })
      setTimeout(() => setMsg(null), 5000)
    },
    onError: () => {
      setMsg({ text: '刪除失敗', type: 'err' })
      setTimeout(() => setMsg(null), 3000)
    },
  })

  const filteredDomains = useMemo(() => {
    if (!domains) return []
    const term = domainSearch.toLowerCase().trim()
    if (!term) return domains
    return domains.filter(
      (d: DomainBinding) =>
        d.subdomain.toLowerCase().includes(term) ||
        String(d.port).includes(term)
    )
  }, [domains, domainSearch])

  const handleAdd = () => {
    const sub = newSubdomain.trim().toLowerCase()
    const port = parseInt(newPort, 10)
    if (!sub || isNaN(port) || port <= 0 || port > 65535) return
    addMutation.mutate({ subdomain: sub, port })
  }

  const handleRemove = (subdomain: string) => {
    if (!confirm(`確定要刪除 ${subdomain}.sisihome.org 的綁定嗎？`)) return
    removeMutation.mutate(subdomain)
  }

  return (
    <div className="space-y-6">
      {/* Add new domain binding */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-white font-semibold text-lg mb-4">
          新增 Domain 綁定
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="subdomain"
                value={newSubdomain}
                onChange={(e) => setNewSubdomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                }}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
              />
              <span className="text-slate-400 text-sm shrink-0">.sisihome.org</span>
            </div>
          </div>
          <input
            type="number"
            placeholder="Port"
            value={newPort}
            onChange={(e) => setNewPort(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
            min={1}
            max={65535}
            className="w-full sm:w-32 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newSubdomain.trim() || !newPort.trim() || addMutation.isPending}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? '新增中...' : '新增'}
          </button>
        </div>
        {msg && (
          <p className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {msg.text}
          </p>
        )}
      </section>

      {/* Existing bindings */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">現有綁定</h2>
          <input
            type="text"
            placeholder="搜尋 Domain..."
            value={domainSearch}
            onChange={(e) => setDomainSearch(e.target.value)}
            className="w-48 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : !filteredDomains || filteredDomains.length === 0 ? (
          <p className="text-slate-500 text-center py-6">
            {domainSearch ? '找不到符合條件的綁定' : '尚無 Domain 綁定'}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredDomains.map((d: DomainBinding) => (
              <div
                key={d.subdomain}
                className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-white font-medium text-sm">
                    {d.subdomain}.sisihome.org
                  </span>
                  <span className="text-slate-500 text-sm">
                    &rarr; localhost:{d.port}
                  </span>
                  {d.service_name && (
                    <span className="text-slate-400 text-xs bg-slate-600/50 px-2 py-0.5 rounded">
                      {d.service_name}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(d.subdomain)}
                  disabled={removeMutation.isPending}
                  className="text-red-400 hover:text-red-300 transition text-sm disabled:opacity-50"
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
