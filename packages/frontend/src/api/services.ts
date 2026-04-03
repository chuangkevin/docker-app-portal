import apiClient from './client'

export interface ServicePort {
  public: number
  private: number
  type: string
}

export interface Service {
  id: number
  container_id: string
  name: string
  display_name?: string | null
  image: string
  ports: ServicePort[]
  status: 'online' | 'offline'
  description: string | null
  ai_description: string | null
  custom_description: string | null
  domain: string | null
  is_pinned: boolean
  is_hidden?: boolean
}

export async function getServices(): Promise<Service[]> {
  const { data } = await apiClient.get<Service[]>('/services')
  return data
}

export async function getAllServices(): Promise<Service[]> {
  const { data } = await apiClient.get<Service[]>('/services/all')
  return data
}

export async function pinService(id: number): Promise<void> {
  await apiClient.post(`/services/${id}/pin`)
}

export async function unpinService(id: number): Promise<void> {
  await apiClient.delete(`/services/${id}/pin`)
}

export async function updateService(
  id: number,
  payload: { custom_description?: string | null; display_name?: string | null }
): Promise<void> {
  await apiClient.patch(`/services/${id}`, payload)
}

export async function regenerateDescription(id: number): Promise<void> {
  await apiClient.post(`/services/${id}/regenerate-description`)
}

export async function toggleServiceVisibility(
  id: number,
  is_hidden: boolean
): Promise<void> {
  await apiClient.post(`/services/${id}/visibility`, { is_hidden })
}
