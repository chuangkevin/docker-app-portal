import apiClient from './client'

export interface CustomLink {
  id: number
  name: string
  url: string
  description: string | null
  icon_color: string
  created_by: number
  is_global: number
  is_pinned: number
  order: number
  created_at: number
}

export async function getLinks(): Promise<CustomLink[]> {
  const { data } = await apiClient.get<CustomLink[]>('/links')
  return data
}

export async function createLink(link: {
  name: string
  url: string
  description?: string
  icon_color?: string
  is_global?: 0 | 1
}): Promise<CustomLink> {
  const { data } = await apiClient.post<CustomLink>('/links', link)
  return data
}

export async function updateLink(
  id: number,
  payload: {
    name?: string
    url?: string
    description?: string | null
    icon_color?: string
    order?: number
  }
): Promise<CustomLink> {
  const { data } = await apiClient.patch<CustomLink>(`/links/${id}`, payload)
  return data
}

export async function pinLink(id: number): Promise<void> {
  await apiClient.post(`/links/${id}/pin`)
}

export async function unpinLink(id: number): Promise<void> {
  await apiClient.delete(`/links/${id}/pin`)
}

export async function deleteLink(id: number): Promise<void> {
  await apiClient.delete(`/links/${id}`)
}
