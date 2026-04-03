import apiClient from './client'
import type { User } from './users'

export interface GeminiKeyStatus {
  isSet: boolean
}

export async function getGeminiKeyStatus(): Promise<GeminiKeyStatus> {
  const { data } = await apiClient.get<GeminiKeyStatus>(
    '/admin/settings/gemini-key'
  )
  return data
}

export async function setGeminiKey(key: string): Promise<void> {
  await apiClient.put('/admin/settings/gemini-key', { key })
}

export async function getAdminUsers(): Promise<User[]> {
  const { data } = await apiClient.get<User[]>('/admin/users')
  return data
}

export async function deleteUser(userId: number): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`)
}

// ==================== API Key Pool ====================

export interface ApiKeyInfo {
  suffix: string
  todayCalls: number
  todayTokens: number
}

export interface TokenUsageStats {
  today: { calls: number; tokens: number }
  week: { calls: number; tokens: number }
  month: { calls: number; tokens: number }
}

export async function getApiKeys(): Promise<{ keys: ApiKeyInfo[] }> {
  const { data } = await apiClient.get<{ keys: ApiKeyInfo[] }>('/admin/settings/api-keys')
  return data
}

export async function addApiKeys(keys: string): Promise<{ added: number; total: number }> {
  const { data } = await apiClient.post<{ added: number; total: number }>('/admin/settings/api-keys', { keys })
  return data
}

export async function deleteApiKey(suffix: string): Promise<void> {
  await apiClient.delete(`/admin/settings/api-keys/${suffix}`)
}

export async function getTokenUsage(): Promise<TokenUsageStats> {
  const { data } = await apiClient.get<TokenUsageStats>('/admin/settings/token-usage')
  return data
}

// ==================== Domain Bindings ====================

export interface DomainBinding {
  subdomain: string
  port: number
}

export async function getDomains(): Promise<DomainBinding[]> {
  const { data } = await apiClient.get<DomainBinding[]>('/domains')
  return data
}

export async function addDomain(subdomain: string, port: number): Promise<void> {
  await apiClient.post('/domains', { subdomain, port })
}

export async function removeDomain(subdomain: string): Promise<void> {
  await apiClient.delete(`/domains/${subdomain}`)
}

export async function updateDomain(subdomain: string, port: number): Promise<void> {
  await apiClient.put(`/domains/${subdomain}`, { port })
}
