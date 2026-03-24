import apiClient from './client'
import type { Service } from './services'

export interface Page {
  id: number
  name: string
  slug: string
  order: number
  services: Service[]
}

export async function getPages(): Promise<Page[]> {
  const { data } = await apiClient.get<Page[]>('/pages')
  return data
}

export async function createPage(payload: { name: string }): Promise<Page> {
  const { data } = await apiClient.post<Page>('/pages', payload)
  return data
}

export async function updatePage(
  id: number,
  payload: { name?: string; order?: number }
): Promise<void> {
  await apiClient.patch(`/pages/${id}`, payload)
}

export async function deletePage(id: number): Promise<void> {
  await apiClient.delete(`/pages/${id}`)
}

export async function setPageServices(
  id: number,
  services: Array<{ service_id: number; order: number }>
): Promise<void> {
  await apiClient.put(`/pages/${id}/services`, { services })
}

export async function updatePageOrder(
  pageId: number,
  serviceIds: number[]
): Promise<void> {
  await apiClient.patch(`/pages/${pageId}/order`, { serviceIds })
}
