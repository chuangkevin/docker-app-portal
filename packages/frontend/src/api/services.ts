import apiClient from './client'

export interface ServicePort {
  public: number
  private: number
  type: string
}

export interface ServicePage {
  id: number
  name: string
  slug: string
}

export interface Service {
  id: number
  container_id: string
  name: string
  image: string
  ports: ServicePort[]
  status: 'online' | 'offline'
  description: string | null
  ai_description: string | null
  custom_description: string | null
  preferred_port?: number | null
  pages: ServicePage[]
  is_hidden?: number
}

export async function getServices(): Promise<Service[]> {
  const { data } = await apiClient.get<Service[]>('/services')
  return data
}

export async function getServicesForSettings(): Promise<Service[]> {
  const { data } = await apiClient.get<Service[]>('/services/settings')
  return data
}

export async function getAllServices(): Promise<Service[]> {
  const { data } = await apiClient.get<Service[]>('/services/all')
  return data
}

export async function updateServicePrefs(
  id: number,
  prefs: { is_hidden?: 0 | 1; preferred_port?: number | null }
): Promise<void> {
  await apiClient.patch(`/services/${id}/prefs`, prefs)
}

export async function regenerateDescription(id: number): Promise<void> {
  await apiClient.post(`/services/${id}/regenerate-description`)
}

export async function updateService(
  id: number,
  payload: { custom_description?: string | null }
): Promise<void> {
  await apiClient.patch(`/services/${id}`, payload)
}
