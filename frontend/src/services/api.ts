const base = (): string => import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
  }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const response = await fetch(base() + path, init)
  const data: unknown = await response.json()
  if (!response.ok) {
    throw data as AuthErrorBody
  }
  return data as T
}

export interface AuthErrorBody {
  detail: string | unknown
  code: string
}

export interface RegisterRequestBody {
  email: string
  password: string
  display_name: string
}

export interface LoginRequestBody {
  email: string
  password: string
}

export async function register(
  body: RegisterRequestBody,
): Promise<{ message: string }> {
  return request<{ message: string }>('POST', '/auth/register', body)
}

export async function login(
  body: LoginRequestBody,
): Promise<{ message: string }> {
  return request<{ message: string }>('POST', '/auth/login', body)
}

export async function logout(): Promise<{ message: string }> {
  return request<{ message: string }>('POST', '/auth/logout')
}

export interface MeResponse {
  user: {
    id: string
    email: string
    display_name: string
    is_tool_admin: boolean
  }
  studios: { studio_id: string; studio_name: string; role: string }[]
}

export async function me(): Promise<MeResponse> {
  return request<MeResponse>('GET', '/auth/me')
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

// --- Studios ---

export interface StudioCreateBody {
  name: string
  description?: string | null
}

export interface StudioUpdateBody {
  name?: string | null
  description?: string | null
}

export interface Studio {
  id: string
  name: string
  description: string | null
  logo_path: string | null
  created_at: string
}

export async function listStudios(): Promise<Studio[]> {
  return request<Studio[]>('GET', '/studios')
}

export async function createStudio(body: StudioCreateBody): Promise<Studio> {
  return request<Studio>('POST', '/studios', body)
}

export async function getStudio(studioId: string): Promise<Studio> {
  return request<Studio>('GET', `/studios/${studioId}`)
}

export async function updateStudio(
  studioId: string,
  body: StudioUpdateBody,
): Promise<Studio> {
  return request<Studio>('PATCH', `/studios/${studioId}`, body)
}

export async function deleteStudio(studioId: string): Promise<void> {
  return request<void>('DELETE', `/studios/${studioId}`)
}

export interface StudioMember {
  user_id: string
  email: string
  display_name: string
  role: string
  joined_at: string
}

export async function listMembers(
  studioId: string,
): Promise<StudioMember[]> {
  return request<StudioMember[]>('GET', `/studios/${studioId}/members`)
}

export async function addMember(
  studioId: string,
  body: { email: string; role: 'studio_admin' | 'studio_member' },
): Promise<StudioMember> {
  return request<StudioMember>('POST', `/studios/${studioId}/members`, body)
}

export async function removeMember(
  studioId: string,
  userId: string,
): Promise<void> {
  return request<void>(
    'DELETE',
    `/studios/${studioId}/members/${userId}`,
  )
}

export async function updateMemberRole(
  studioId: string,
  userId: string,
  role: 'studio_admin' | 'studio_member',
): Promise<StudioMember> {
  return request<StudioMember>(
    'PATCH',
    `/studios/${studioId}/members/${userId}`,
    { role },
  )
}

// --- Software ---

export interface SoftwareCreateBody {
  name: string
  description?: string | null
}

export interface SoftwareUpdateBody {
  name?: string | null
  description?: string | null
  definition?: string | null
  git_repo_url?: string | null
  git_branch?: string | null
  /** Omit to leave unchanged; empty string clears stored token */
  git_token?: string | null
}

export interface Software {
  id: string
  studio_id: string
  name: string
  description: string | null
  definition: string | null
  git_provider: string | null
  git_repo_url: string | null
  git_branch: string | null
  git_token_set: boolean
  created_at: string
  updated_at: string
}

export async function listSoftware(studioId: string): Promise<Software[]> {
  return request<Software[]>('GET', `/studios/${studioId}/software`)
}

export async function createSoftware(
  studioId: string,
  body: SoftwareCreateBody,
): Promise<Software> {
  return request<Software>('POST', `/studios/${studioId}/software`, body)
}

export async function getSoftware(
  studioId: string,
  softwareId: string,
): Promise<Software> {
  return request<Software>(
    'GET',
    `/studios/${studioId}/software/${softwareId}`,
  )
}

export async function updateSoftware(
  studioId: string,
  softwareId: string,
  body: SoftwareUpdateBody,
): Promise<Software> {
  return request<Software>(
    'PATCH',
    `/studios/${studioId}/software/${softwareId}`,
    body,
  )
}

export async function deleteSoftware(
  studioId: string,
  softwareId: string,
): Promise<void> {
  return request<void>(
    'DELETE',
    `/studios/${studioId}/software/${softwareId}`,
  )
}

export interface GitTestResult {
  ok: boolean
  message: string
}

export async function testGitConnection(
  studioId: string,
  softwareId: string,
): Promise<GitTestResult> {
  return request<GitTestResult>(
    'POST',
    `/studios/${studioId}/software/${softwareId}/git/test`,
  )
}
