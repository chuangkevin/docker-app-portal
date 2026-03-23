import apiClient from './client'
import type { User } from './users'

export interface GeminiKeyStatus {
  isSet: boolean
}

export interface ServiceOverride {
  service_id: number
  service_name: string
  is_hidden: number
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

export async function getUserOverrides(
  userId: number
): Promise<ServiceOverride[]> {
  const { data } = await apiClient.get<ServiceOverride[]>(
    `/admin/users/${userId}/overrides`
  )
  return data
}

export async function setUserOverrides(
  userId: number,
  overrides: Array<{ service_id: number; is_hidden: 0 | 1 }>
): Promise<void> {
  await apiClient.put(`/admin/users/${userId}/overrides`, { overrides })
}

export async function setGlobalOverride(
  serviceId: number,
  payload: { is_force_hidden: 0 | 1 }
): Promise<void> {
  await apiClient.put(
    `/admin/services/${serviceId}/global-override`,
    payload
  )
}

export async function deleteUser(userId: number): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`)
}
