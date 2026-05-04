import {
  consumePrivateThreadSseBody,
  type PrivateThreadStreamMeta,
} from './privateThreadSse'

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
  const text = await response.text()
  if (!response.ok) {
    let err: AuthErrorBody = {
      detail: response.statusText,
      code: 'HTTP_ERROR',
    }
    if (text) {
      try {
        err = JSON.parse(text) as AuthErrorBody
      } catch {
        err = { detail: text, code: 'HTTP_ERROR' }
      }
    }
    throw err
  }
  if (!text) {
    return undefined as T
  }
  return JSON.parse(text) as T
}

export interface AuthErrorBody {
  detail: string | unknown
  code: string
}

export async function throwIfNotOk(r: Response): Promise<void> {
  if (r.ok) {
    return
  }
  const text = await r.text()
  let err: AuthErrorBody = {
    detail: r.statusText,
    code: 'HTTP_ERROR',
  }
  if (text) {
    try {
      err = JSON.parse(text) as AuthErrorBody
    } catch {
      err = { detail: text, code: 'HTTP_ERROR' }
    }
  }
  throw err
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

export interface CrossStudioGrantPublic {
  grant_id: string
  target_software_id: string
  owner_studio_id: string
  owner_studio_name: string
  software_name: string
  access_level: string
}

export interface MeResponse {
  user: {
    id: string
    email: string
    display_name: string
    is_tool_admin: boolean
  }
  studios: { studio_id: string; studio_name: string; role: string }[]
  cross_studio_grants?: CrossStudioGrantPublic[]
}

export async function me(): Promise<MeResponse> {
  return request<MeResponse>('GET', '/auth/me')
}

/** Tool-wide LLM identity (read-only; no secrets). */
export interface LlmRuntimeInfo {
  llm_provider: string | null
  llm_model: string | null
}

export async function getLlmRuntimeInfo(): Promise<LlmRuntimeInfo> {
  return request<LlmRuntimeInfo>('GET', '/auth/llm-runtime')
}

export interface UserProfilePatchBody {
  display_name: string
}

export async function patchMeProfile(
  body: UserProfilePatchBody,
): Promise<MeResponse> {
  return request<MeResponse>('PATCH', '/auth/me', body)
}

export interface NotificationRow {
  id: string
  kind: string
  title: string
  body: string
  read_at: string | null
  created_at: string
  studio_id?: string | null
  software_id?: string | null
  project_id?: string | null
  section_id?: string | null
}

export interface NotificationListResponse {
  items: NotificationRow[]
  next_cursor: string | null
}

export interface MarkAllReadResponse {
  updated: number
}

export async function listMeNotifications(params?: {
  limit?: number
  cursor?: string | null
}): Promise<NotificationListResponse> {
  const sp = new URLSearchParams()
  if (params?.limit !== undefined) sp.set('limit', String(params.limit))
  if (params?.cursor) sp.set('cursor', params.cursor)
  const q = sp.toString()
  return request<NotificationListResponse>(
    'GET',
    `/me/notifications${q ? `?${q}` : ''}`,
  )
}

export async function patchMeNotificationRead(
  notificationId: string,
  read: boolean,
): Promise<NotificationRow> {
  return request<NotificationRow>(
    'PATCH',
    `/me/notifications/${notificationId}`,
    { read },
  )
}

export async function postMeNotificationsMarkAllRead(): Promise<MarkAllReadResponse> {
  return request<MarkAllReadResponse>(
    'POST',
    '/me/notifications/mark-all-read',
  )
}

function appendTokenUsageParamKey(
  sp: URLSearchParams,
  key: string,
  value: string | string[] | number | undefined,
): void {
  if (value === undefined || value === '') return
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = String(item).trim()
      if (s) sp.append(key, s)
    }
    return
  }
  if (typeof value === 'number') {
    sp.append(key, String(value))
    return
  }
  sp.append(key, String(value))
}

function appendTokenUsageParams(
  sp: URLSearchParams,
  params: TokenUsageQueryParams | undefined,
): void {
  if (!params) return
  appendTokenUsageParamKey(sp, 'studio_id', params.studio_id)
  appendTokenUsageParamKey(sp, 'software_id', params.software_id)
  appendTokenUsageParamKey(sp, 'project_id', params.project_id)
  appendTokenUsageParamKey(sp, 'work_order_id', params.work_order_id)
  appendTokenUsageParamKey(sp, 'user_id', params.user_id)
  appendTokenUsageParamKey(sp, 'call_type', params.call_type)
  appendTokenUsageParamKey(sp, 'date_from', params.date_from)
  appendTokenUsageParamKey(sp, 'date_to', params.date_to)
  if (params.limit !== undefined) sp.append('limit', String(params.limit))
  if (params.offset !== undefined) sp.append('offset', String(params.offset))
}

async function fetchCsv(pathWithQuery: string): Promise<Blob> {
  const response = await fetch(base() + pathWithQuery, {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  })
  if (!response.ok) {
    const text = await response.text()
    let err: AuthErrorBody = {
      detail: response.statusText,
      code: 'HTTP_ERROR',
    }
    if (text) {
      try {
        err = JSON.parse(text) as AuthErrorBody
      } catch {
        err = { detail: text, code: 'HTTP_ERROR' }
      }
    }
    throw err
  }
  return response.blob()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type TokenUsageIdParam = string | string[] | undefined

export interface TokenUsageQueryParams {
  studio_id?: TokenUsageIdParam
  software_id?: TokenUsageIdParam
  project_id?: TokenUsageIdParam
  work_order_id?: TokenUsageIdParam
  user_id?: TokenUsageIdParam
  call_type?: TokenUsageIdParam
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export interface TokenUsageRow {
  id: string
  studio_id: string | null
  software_id: string | null
  project_id: string | null
  work_order_id: string | null
  user_id: string | null
  call_type: string
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: string | null
  created_at: string
}

export interface TokenUsageTotals {
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: string
}

export interface TokenUsageReport {
  rows: TokenUsageRow[]
  totals: TokenUsageTotals
}

export async function getAdminTokenUsage(
  params?: TokenUsageQueryParams,
): Promise<TokenUsageReport> {
  const sp = new URLSearchParams()
  appendTokenUsageParams(sp, params)
  const q = sp.toString()
  return request<TokenUsageReport>(
    'GET',
    `/admin/token-usage${q ? `?${q}` : ''}`,
  )
}

export async function downloadAdminTokenUsageCsv(
  params?: TokenUsageQueryParams,
): Promise<Blob> {
  const sp = new URLSearchParams()
  appendTokenUsageParams(sp, params)
  const q = sp.toString()
  return fetchCsv(`/admin/token-usage${q ? `?${q}` : ''}`)
}

export async function getStudioTokenUsage(
  studioId: string,
  params?: Omit<TokenUsageQueryParams, 'studio_id'>,
): Promise<TokenUsageReport> {
  const sp = new URLSearchParams()
  appendTokenUsageParams(sp, params)
  const q = sp.toString()
  return request<TokenUsageReport>(
    'GET',
    `/studios/${studioId}/token-usage${q ? `?${q}` : ''}`,
  )
}

export async function downloadStudioTokenUsageCsv(
  studioId: string,
  params?: Omit<TokenUsageQueryParams, 'studio_id'>,
): Promise<Blob> {
  const sp = new URLSearchParams()
  appendTokenUsageParams(sp, params)
  const q = sp.toString()
  return fetchCsv(`/studios/${studioId}/token-usage${q ? `?${q}` : ''}`)
}

export async function getMeTokenUsage(
  params?: Omit<TokenUsageQueryParams, 'user_id'>,
): Promise<TokenUsageReport> {
  const sp = new URLSearchParams()
  appendTokenUsageParams(sp, params)
  const q = sp.toString()
  return request<TokenUsageReport>(
    'GET',
    `/me/token-usage${q ? `?${q}` : ''}`,
  )
}

export async function downloadMeTokenUsageCsv(
  params?: Omit<TokenUsageQueryParams, 'user_id'>,
): Promise<Blob> {
  const sp = new URLSearchParams()
  appendTokenUsageParams(sp, params)
  const q = sp.toString()
  return fetchCsv(`/me/token-usage${q ? `?${q}` : ''}`)
}

export interface CrossStudioRequestBody {
  target_software_id: string
  requested_access_level?: 'viewer' | 'external_editor'
}

export interface CrossStudioRequestResult {
  id: string
  status: string
  access_level: string
}

export async function postStudioCrossStudioRequest(
  studioId: string,
  body: CrossStudioRequestBody,
): Promise<CrossStudioRequestResult> {
  return request<CrossStudioRequestResult>(
    'POST',
    `/studios/${studioId}/cross-studio-request`,
    body,
  )
}

export interface CrossStudioAdminRow {
  id: string
  requesting_studio_id: string
  requesting_studio_name: string
  target_software_id: string
  target_software_name: string
  owner_studio_id: string
  owner_studio_name: string
  requested_by: string
  requester_email: string
  access_level: string
  status: string
  created_at: string
  resolved_at: string | null
}

export async function listAdminCrossStudio(params?: {
  status?: string
  limit?: number
}): Promise<CrossStudioAdminRow[]> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const q = sp.toString()
  return request<CrossStudioAdminRow[]>(
    'GET',
    `/admin/cross-studio${q ? `?${q}` : ''}`,
  )
}

export interface CrossStudioResolveBody {
  decision: 'approve' | 'reject' | 'revoke'
  access_level?: 'viewer' | 'external_editor' | null
}

export async function putAdminCrossStudioResolve(
  grantId: string,
  body: CrossStudioResolveBody,
): Promise<CrossStudioRequestResult> {
  return request<CrossStudioRequestResult>(
    'PUT',
    `/admin/cross-studio/${grantId}`,
    body,
  )
}

// --- Tool admin /admin/config ---

export interface AdminConfigPublic {
  llm_provider: string | null
  llm_model: string | null
  llm_api_base_url: string | null
  llm_api_key_set: boolean
  embedding_provider: string | null
  embedding_model: string | null
  embedding_api_base_url: string | null
  embedding_api_key_set: boolean
}

/** Only include fields you intend to change; omitted keys are left unchanged on the server. */
export type AdminConfigUpdateBody = {
  llm_provider?: string | null
  llm_model?: string | null
  llm_api_key?: string | null
  llm_api_base_url?: string | null
  embedding_provider?: string | null
  embedding_model?: string | null
  embedding_api_key?: string | null
  embedding_api_base_url?: string | null
}

export async function getAdminConfig(): Promise<AdminConfigPublic> {
  return request<AdminConfigPublic>('GET', '/admin/config')
}

export async function putAdminConfig(
  body: AdminConfigUpdateBody,
): Promise<AdminConfigPublic> {
  return request<AdminConfigPublic>('PUT', '/admin/config', body)
}

export interface AdminConnectivityResult {
  ok: boolean
  message: string
  detail: string | null
}

/** Optional overrides for POST /admin/test/llm (defaults from admin_config). */
export type AdminLlmProbeBody = {
  model?: string | null
  api_base_url?: string | null
}

export async function postAdminTestLlm(
  body: AdminLlmProbeBody = {},
): Promise<AdminConnectivityResult> {
  return request<AdminConnectivityResult>('POST', '/admin/test/llm', body)
}

export async function postAdminTestEmbedding(): Promise<AdminConnectivityResult> {
  return request<AdminConnectivityResult>('POST', '/admin/test/embedding')
}

// --- Admin console (overview, directory) ---

export interface DeploymentActivityRow {
  id: string
  created_at: string
  actor_user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  summary: string | null
}

export interface StudioOverviewRow {
  studio_id: string
  name: string
  software_count: number
  member_count: number
  mtd_spend_usd: string
  budget_cap_monthly_usd: string | null
  budget_overage_action: string
}

export interface AdminConsoleOverview {
  studios: StudioOverviewRow[]
  mtd_spend_total_usd: string
  active_builders_count: number
  embedding_collection_count: number
  recent_activity: DeploymentActivityRow[]
}

export async function getAdminConsoleOverview(): Promise<AdminConsoleOverview> {
  return request<AdminConsoleOverview>('GET', '/admin/console/overview')
}

export interface AdminStudioMembershipRow {
  studio_id: string
  studio_name: string
  role: string
}

export interface AdminUserDirectoryRow {
  user_id: string
  email: string
  display_name: string
  is_tool_admin: boolean
  created_at: string
  studio_memberships: AdminStudioMembershipRow[]
}

export async function getAdminUsers(params?: {
  limit?: number
  offset?: number
}): Promise<AdminUserDirectoryRow[]> {
  const sp = new URLSearchParams()
  if (params?.limit != null) sp.set('limit', String(params.limit))
  if (params?.offset != null) sp.set('offset', String(params.offset))
  const q = sp.toString()
  return request<AdminUserDirectoryRow[]>('GET', `/admin/users${q ? `?${q}` : ''}`)
}

export interface AdminUserPublic {
  id: string
  email: string
  display_name: string
  is_tool_admin: boolean
}

export async function putAdminUserAdminStatus(
  userId: string,
  body: { is_tool_admin: boolean },
): Promise<AdminUserPublic> {
  return request<AdminUserPublic>(
    'PUT',
    `/admin/users/${encodeURIComponent(userId)}/admin-status`,
    body,
  )
}

// --- Admin LLM connectivity ---

export interface LlmProviderRegistryRow {
  id: string
  provider_key: string
  display_name: string
  models: string[]
  region: string | null
  api_base_url: string | null
  status: string
  is_default: boolean
  key_preview: string | null
  sort_order: number
}

export type LlmProviderUpsertBody = {
  display_name: string
  models: string[]
  region?: string | null
  api_base_url?: string | null
  status?: string
  is_default?: boolean
  key_preview?: string | null
  sort_order?: number
}

/** Combined Tool admin config + LLM provider registry for the LLM connectivity page. */
export interface AdminLlmDeployment {
  credentials: AdminConfigPublic
  providers: LlmProviderRegistryRow[]
}

export async function getAdminLlmDeployment(): Promise<AdminLlmDeployment> {
  return request<AdminLlmDeployment>('GET', '/admin/llm/deployment')
}

export async function getAdminLlmProviders(): Promise<LlmProviderRegistryRow[]> {
  return request<LlmProviderRegistryRow[]>('GET', '/admin/llm/providers')
}

export async function putAdminLlmProvider(
  providerKey: string,
  body: LlmProviderUpsertBody,
): Promise<LlmProviderRegistryRow> {
  return request<LlmProviderRegistryRow>(
    'PUT',
    `/admin/llm/providers/${encodeURIComponent(providerKey)}`,
    body,
  )
}

export async function deleteAdminLlmProvider(providerKey: string): Promise<void> {
  return request<void>('DELETE', `/admin/llm/providers/${encodeURIComponent(providerKey)}`)
}

export interface LlmRoutingRuleRow {
  use_case: string
  primary_model: string
  fallback_model: string | null
}

export async function getAdminLlmRouting(): Promise<LlmRoutingRuleRow[]> {
  return request<LlmRoutingRuleRow[]>('GET', '/admin/llm/routing')
}

export async function putAdminLlmRouting(body: {
  rules: LlmRoutingRuleRow[]
}): Promise<LlmRoutingRuleRow[]> {
  return request<LlmRoutingRuleRow[]>('PUT', '/admin/llm/routing', body)
}

export interface StudioLlmPolicyRow {
  provider_key: string
  enabled: boolean
  selected_model: string | null
}

export async function getAdminStudioLlmPolicy(
  studioId: string,
): Promise<StudioLlmPolicyRow[]> {
  return request<StudioLlmPolicyRow[]>(
    'GET',
    `/admin/studios/${encodeURIComponent(studioId)}/llm-policy`,
  )
}

export async function putAdminStudioLlmPolicy(
  studioId: string,
  body: { rows: StudioLlmPolicyRow[] },
): Promise<StudioLlmPolicyRow[]> {
  return request<StudioLlmPolicyRow[]>(
    'PUT',
    `/admin/studios/${encodeURIComponent(studioId)}/llm-policy`,
    body,
  )
}

// --- Admin embeddings registry ---

export interface EmbeddingModelRegistryRow {
  id: string
  model_id: string
  provider_name: string
  dim: number
  cost_per_million_usd: string | null
  region: string | null
  default_role: string | null
}

export type EmbeddingModelUpsertBody = {
  model_id: string
  provider_name: string
  dim: number
  cost_per_million_usd?: string | null
  region?: string | null
  default_role?: string | null
}

export async function getAdminEmbeddingModels(): Promise<EmbeddingModelRegistryRow[]> {
  return request<EmbeddingModelRegistryRow[]>('GET', '/admin/embeddings/models')
}

export async function putAdminEmbeddingModel(
  modelId: string,
  body: EmbeddingModelUpsertBody,
): Promise<EmbeddingModelRegistryRow> {
  return request<EmbeddingModelRegistryRow>(
    'PUT',
    `/admin/embeddings/models/${encodeURIComponent(modelId)}`,
    body,
  )
}

export async function deleteAdminEmbeddingModel(modelId: string): Promise<void> {
  return request<void>(
    'DELETE',
    `/admin/embeddings/models/${encodeURIComponent(modelId)}`,
  )
}

export interface AdminEmbeddingLibraryStudioRow {
  studio_id: string
  studio_name: string
  artifact_count: number
  embedded_artifact_count: number
  artifact_vector_chunks: number
  section_vector_chunks: number
}

export async function getAdminEmbeddingLibrary(): Promise<
  AdminEmbeddingLibraryStudioRow[]
> {
  return request<AdminEmbeddingLibraryStudioRow[]>('GET', '/admin/embeddings/library')
}

export interface EmbeddingReindexPolicy {
  id: number
  auto_reindex_trigger: string
  debounce_seconds: number
  drift_threshold_pct: string
  retention_days: number
}

export type EmbeddingReindexPolicyPatchBody = {
  auto_reindex_trigger?: string | null
  debounce_seconds?: number | null
  drift_threshold_pct?: string | null
  retention_days?: number | null
}

export async function getAdminEmbeddingReindexPolicy(): Promise<EmbeddingReindexPolicy> {
  return request<EmbeddingReindexPolicy>('GET', '/admin/embeddings/reindex-policy')
}

export async function patchAdminEmbeddingReindexPolicy(
  body: EmbeddingReindexPolicyPatchBody,
): Promise<EmbeddingReindexPolicy> {
  return request<EmbeddingReindexPolicy>(
    'PATCH',
    '/admin/embeddings/reindex-policy',
    body,
  )
}

// --- Admin studio budget (tool admin) ---

export type StudioBudgetPatchBody = {
  budget_cap_monthly_usd?: string | null
  budget_overage_action?: string
}

export async function patchAdminStudioBudget(
  studioId: string,
  body: StudioBudgetPatchBody,
): Promise<void> {
  return request<void>(
    'PATCH',
    `/admin/studios/${encodeURIComponent(studioId)}/budget`,
    body,
  )
}

// --- Admin per-member studio budgets (tool admin) ---

export interface AdminMemberBudgetRow {
  user_id: string
  email: string
  display_name: string
  role: string
  budget_cap_monthly_usd: string | number | null
  mtd_spend_usd: string | number
}

export type MemberStudioBudgetPatchBody = {
  budget_cap_monthly_usd: string | null
}

export async function getAdminStudioMemberBudgets(
  studioId: string,
): Promise<AdminMemberBudgetRow[]> {
  return request<AdminMemberBudgetRow[]>(
    'GET',
    `/admin/studios/${encodeURIComponent(studioId)}/member-budgets`,
  )
}

export async function patchAdminStudioMemberBudget(
  studioId: string,
  userId: string,
  body: MemberStudioBudgetPatchBody,
): Promise<AdminMemberBudgetRow> {
  return request<AdminMemberBudgetRow>(
    'PATCH',
    `/admin/studios/${encodeURIComponent(studioId)}/members/${encodeURIComponent(userId)}/budget`,
    body,
  )
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
  budget_cap_monthly_usd?: string | null
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
  body: {
    email: string
    role: 'studio_admin' | 'studio_member' | 'studio_viewer'
  },
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
  role: 'studio_admin' | 'studio_member' | 'studio_viewer',
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
    'PUT',
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

// --- Projects (under /software/{software_id}) ---

export interface ProjectCreateBody {
  name: string
  description?: string | null
  publish_folder_slug?: string | null
}

export interface ProjectUpdateBody {
  name?: string | null
  description?: string | null
  publish_folder_slug?: string | null
}

export type SectionStatus = 'ready' | 'gaps' | 'conflict' | 'empty'

export interface SectionSummary {
  id: string
  title: string
  slug: string
  order: number
  status: SectionStatus
  open_issue_count: number
  updated_at: string
}

export interface Project {
  id: string
  software_id: string
  name: string
  description: string | null
  publish_folder_slug: string
  archived: boolean
  created_at: string
  updated_at: string
  sections: SectionSummary[] | null
  work_orders_done: number
  work_orders_total: number
  sections_count: number
  last_edited_at: string | null
}

export interface StudioProjectRow extends Project {
  software_name: string
}

export async function listStudioProjects(
  studioId: string,
  opts?: { includeArchived?: boolean },
): Promise<StudioProjectRow[]> {
  const q =
    opts?.includeArchived === true ? '?include_archived=true' : ''
  return request<StudioProjectRow[]>(
    'GET',
    `/studios/${studioId}/projects${q}`,
  )
}

export async function listProjects(
  softwareId: string,
  opts?: { includeArchived?: boolean },
): Promise<Project[]> {
  const q =
    opts?.includeArchived === true ? '?include_archived=true' : ''
  return request<Project[]>('GET', `/software/${softwareId}/projects${q}`)
}

export async function createProject(
  softwareId: string,
  body: ProjectCreateBody,
): Promise<Project> {
  return request<Project>('POST', `/software/${softwareId}/projects`, body)
}

export async function getProject(
  softwareId: string,
  projectId: string,
): Promise<Project> {
  return request<Project>(
    'GET',
    `/software/${softwareId}/projects/${projectId}`,
  )
}

export async function updateProject(
  softwareId: string,
  projectId: string,
  body: ProjectUpdateBody,
): Promise<Project> {
  return request<Project>(
    'PUT',
    `/software/${softwareId}/projects/${projectId}`,
    body,
  )
}

export async function patchProjectArchived(
  softwareId: string,
  projectId: string,
  archived: boolean,
): Promise<Project> {
  return request<Project>(
    'PATCH',
    `/software/${softwareId}/projects/${projectId}`,
    { archived },
  )
}

export async function deleteProject(
  softwareId: string,
  projectId: string,
): Promise<void> {
  return request<void>(
    'DELETE',
    `/software/${softwareId}/projects/${projectId}`,
  )
}

// --- Project knowledge graph (GET /projects/{project_id}/graph) ---

export interface ProjectGraphNode {
  id: string
  entity_type: string
  entity_id: string
  label: string
  stale?: boolean | null
  status?: string | null
}

export interface ProjectGraphEdge {
  source: string
  target: string
  edge_type: string
}

export interface ProjectGraphResponse {
  nodes: ProjectGraphNode[]
  edges: ProjectGraphEdge[]
}

export async function getProjectGraph(
  projectId: string,
): Promise<ProjectGraphResponse> {
  return request<ProjectGraphResponse>(
    'GET',
    `/projects/${projectId}/graph`,
  )
}

// --- Project chat (Slice 10) ---

export interface ChatMessageRow {
  id: string
  project_id: string
  user_id: string | null
  role: string
  content: string
  created_at: string
}

export interface ProjectChatHistoryResponse {
  messages: ChatMessageRow[]
  next_before: string | null
}

export async function getProjectChat(
  projectId: string,
  opts?: { before?: string; limit?: number },
): Promise<ProjectChatHistoryResponse> {
  const params = new URLSearchParams()
  if (opts?.before) params.set('before', opts.before)
  if (opts?.limit != null) params.set('limit', String(opts.limit))
  const q = params.toString()
  return request<ProjectChatHistoryResponse>(
    'GET',
    `/projects/${projectId}/chat${q ? `?${q}` : ''}`,
  )
}

// --- Software chat (shared thread per software) ---

export interface SoftwareChatMessageRow {
  id: string
  software_id: string
  user_id: string | null
  role: string
  content: string
  created_at: string
}

export interface SoftwareChatHistoryResponse {
  messages: SoftwareChatMessageRow[]
  next_before: string | null
}

export async function getSoftwareChat(
  softwareId: string,
  opts?: { before?: string; limit?: number },
): Promise<SoftwareChatHistoryResponse> {
  const params = new URLSearchParams()
  if (opts?.before) params.set('before', opts.before)
  if (opts?.limit != null) params.set('limit', String(opts.limit))
  const q = params.toString()
  return request<SoftwareChatHistoryResponse>(
    'GET',
    `/software/${softwareId}/chat${q ? `?${q}` : ''}`,
  )
}

export interface BuilderComposerHintResponse {
  headline: string
  input_placeholder: string
}

export async function postBuilderComposerHint(body: {
  software_id: string
  project_id?: string | null
  local_hour?: number | null
}): Promise<BuilderComposerHintResponse> {
  return request<BuilderComposerHintResponse>(
    'POST',
    '/me/builder-composer-hint',
    body,
  )
}

// --- Publish & issues (Slice 11) ---

export interface PublishResponse {
  commit_url: string
  commit_sha?: string | null
  files_committed: number
}

export async function publishProject(
  projectId: string,
  body?: { commit_message?: string | null },
): Promise<PublishResponse> {
  return request<PublishResponse>(
    'POST',
    `/projects/${projectId}/publish`,
    body ?? {},
  )
}

export interface IssueRow {
  id: string
  project_id: string
  triggered_by: string | null
  section_a_id: string | null
  section_b_id: string | null
  description: string
  status: string
  origin: string
  run_actor_id: string | null
  created_at: string
}

export async function listProjectIssues(
  projectId: string,
  opts?: { sectionId?: string },
): Promise<IssueRow[]> {
  const sp = new URLSearchParams()
  if (opts?.sectionId) {
    sp.set('section_id', opts.sectionId)
  }
  const qs = sp.toString()
  return request<IssueRow[]>(
    'GET',
    `/projects/${projectId}/issues${qs ? `?${qs}` : ''}`,
  )
}

export async function updateIssue(
  projectId: string,
  issueId: string,
  status: 'open' | 'resolved',
): Promise<IssueRow> {
  return request<IssueRow>('PUT', `/projects/${projectId}/issues/${issueId}`, {
    status,
  })
}

export async function runProjectAnalyze(
  projectId: string,
): Promise<{ issues_created: number }> {
  return request<{ issues_created: number }>(
    'POST',
    `/projects/${projectId}/analyze`,
  )
}

export type AttentionKind = 'conflict' | 'gap' | 'drift' | 'update'

export interface AttentionLinks {
  issue_id: string | null
  work_order_id: string | null
  section_id: string | null
}

export interface AttentionItem {
  id: string
  kind: AttentionKind
  title: string
  subtitle: string
  description: string
  occurred_at: string
  links: AttentionLinks
}

export interface AttentionCounts {
  all: number
  conflict: number
  drift: number
  gap: number
  update: number
}

export interface ProjectAttentionResponse {
  studio_id: string
  software_id: string
  project_id: string
  counts: AttentionCounts
  items: AttentionItem[]
}

export async function getProjectAttention(
  projectId: string,
): Promise<ProjectAttentionResponse> {
  return request<ProjectAttentionResponse>(
    'GET',
    `/projects/${projectId}/attention`,
  )
}

export interface SoftwareAttentionRow {
  project_id: string
  project_name: string
  item: AttentionItem
}

export interface SoftwareAttentionResponse {
  studio_id: string
  software_id: string
  counts: AttentionCounts
  items: SoftwareAttentionRow[]
}

export async function getSoftwareAttention(
  softwareId: string,
): Promise<SoftwareAttentionResponse> {
  return request<SoftwareAttentionResponse>(
    'GET',
    `/software/${softwareId}/attention`,
  )
}

export interface SoftwareActivityItem {
  id: string
  verb: string
  summary: string
  actor_user_id: string | null
  entity_type: string | null
  entity_id: string | null
  created_at: string
  actor_display?: string | null
  context_label?: string | null
  software_name?: string | null
}

export interface SoftwareActivityResponse {
  items: SoftwareActivityItem[]
}

export async function getSoftwareActivity(
  softwareId: string,
  opts?: { limit?: number },
): Promise<SoftwareActivityResponse> {
  const lim = opts?.limit != null ? `?limit=${opts.limit}` : ''
  return request<SoftwareActivityResponse>(
    'GET',
    `/software/${softwareId}/activity${lim}`,
  )
}

export async function getStudioActivity(
  studioId: string,
  opts?: { limit?: number },
): Promise<SoftwareActivityResponse> {
  const lim = opts?.limit != null ? `?limit=${opts.limit}` : ''
  return request<SoftwareActivityResponse>(
    'GET',
    `/studios/${studioId}/activity${lim}`,
  )
}

export type EmbeddingStatus = 'pending' | 'embedded' | 'failed' | 'skipped'

export type ArtifactScopeLevel = 'studio' | 'software' | 'project'

export interface SoftwareArtifactRow {
  id: string
  project_id: string | null
  project_name: string | null
  name: string
  file_type: string
  size_bytes: number
  uploaded_by: string | null
  uploaded_by_display: string | null
  created_at: string
  scope_level: ArtifactScopeLevel
  excluded_at_software: string | null
  excluded_at_project: string | null
  embedding_status?: EmbeddingStatus | null
  embedded_at?: string | null
  chunk_count?: number | null
  extracted_char_count?: number | null
}

export interface StudioArtifactRow extends SoftwareArtifactRow {
  software_id: string | null
  software_name: string | null
}

export async function listSoftwareArtifacts(
  softwareId: string,
  opts?: { forProjectId?: string },
): Promise<SoftwareArtifactRow[]> {
  const q =
    opts?.forProjectId != null && opts.forProjectId !== ''
      ? `?for_project_id=${encodeURIComponent(opts.forProjectId)}`
      : ''
  return request<SoftwareArtifactRow[]>(
    'GET',
    `/software/${softwareId}/artifacts${q}`,
  )
}

export async function listStudioArtifacts(
  studioId: string,
): Promise<StudioArtifactRow[]> {
  return request<StudioArtifactRow[]>(
    'GET',
    `/studios/${studioId}/artifacts`,
  )
}

/** Unified artifact library (studio + software + project rows). Optional ``softwareId`` filters server-side. */
export async function listArtifactLibrary(
  studioId: string,
  opts?: { softwareId?: string },
): Promise<StudioArtifactRow[]> {
  const q =
    opts?.softwareId != null && opts.softwareId !== ''
      ? `?softwareId=${encodeURIComponent(opts.softwareId)}`
      : ''
  return request<StudioArtifactRow[]>(
    'GET',
    `/studios/${studioId}/artifact-library${q}`,
  )
}

export async function uploadStudioArtifact(
  studioId: string,
  file: File,
  displayName?: string,
): Promise<ArtifactItem> {
  const fd = new FormData()
  fd.append('file', file)
  if (displayName?.trim()) {
    fd.append('name', displayName.trim())
  }
  const r = await fetch(base() + `/studios/${studioId}/artifacts`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  const text = await r.text()
  if (!r.ok) {
    let err: AuthErrorBody = {
      detail: r.statusText,
      code: 'HTTP_ERROR',
    }
    if (text) {
      try {
        err = JSON.parse(text) as AuthErrorBody
      } catch {
        err = { detail: text, code: 'HTTP_ERROR' }
      }
    }
    throw err
  }
  return JSON.parse(text) as ArtifactItem
}

export async function createStudioMarkdownArtifact(
  studioId: string,
  body: { name: string; content: string },
): Promise<ArtifactItem> {
  return request<ArtifactItem>(
    'POST',
    `/studios/${studioId}/artifacts/md`,
    body,
  )
}

export async function uploadSoftwareArtifact(
  softwareId: string,
  file: File,
  displayName?: string,
): Promise<ArtifactItem> {
  const fd = new FormData()
  fd.append('file', file)
  if (displayName?.trim()) {
    fd.append('name', displayName.trim())
  }
  const r = await fetch(base() + `/software/${softwareId}/artifacts`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  const text = await r.text()
  if (!r.ok) {
    let err: AuthErrorBody = {
      detail: r.statusText,
      code: 'HTTP_ERROR',
    }
    if (text) {
      try {
        err = JSON.parse(text) as AuthErrorBody
      } catch {
        err = { detail: text, code: 'HTTP_ERROR' }
      }
    }
    throw err
  }
  return JSON.parse(text) as ArtifactItem
}

export async function createSoftwareMarkdownArtifact(
  softwareId: string,
  body: { name: string; content: string },
): Promise<ArtifactItem> {
  return request<ArtifactItem>(
    'POST',
    `/software/${softwareId}/artifacts/md`,
    body,
  )
}

export interface ArtifactExclusionPatchBody {
  artifact_id: string
  excluded: boolean
}

export interface ArtifactExclusionPatchResult {
  artifact_id: string
  excluded: boolean
}

export async function patchSoftwareArtifactExclusion(
  studioId: string,
  softwareId: string,
  body: ArtifactExclusionPatchBody,
): Promise<ArtifactExclusionPatchResult> {
  return request<ArtifactExclusionPatchResult>(
    'PATCH',
    `/studios/${studioId}/software/${softwareId}/artifact-exclusions`,
    body,
  )
}

export async function patchProjectArtifactExclusion(
  studioId: string,
  softwareId: string,
  projectId: string,
  body: ArtifactExclusionPatchBody,
): Promise<ArtifactExclusionPatchResult> {
  return request<ArtifactExclusionPatchResult>(
    'PATCH',
    `/studios/${studioId}/software/${softwareId}/projects/${projectId}/artifact-exclusions`,
    body,
  )
}

export interface SoftwareTokenUsageSummary {
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: string
  period_start: string
  period_end: string
}

export async function getSoftwareTokenUsageSummary(
  studioId: string,
  softwareId: string,
): Promise<SoftwareTokenUsageSummary> {
  return request<SoftwareTokenUsageSummary>(
    'GET',
    `/studios/${studioId}/software/${softwareId}/token-usage/summary`,
  )
}

export interface GitCommitItem {
  id?: string | null
  short_id?: string | null
  title?: string | null
  message?: string | null
  author_name?: string
  created_at?: string | null
  web_url?: string | null
}

export async function getSoftwareGitHistory(
  studioId: string,
  softwareId: string,
): Promise<{ commits: GitCommitItem[] }> {
  return request<{ commits: GitCommitItem[] }>(
    'GET',
    `/studios/${studioId}/software/${softwareId}/history`,
  )
}

// --- MCP keys (Slice 12) ---

export interface McpKeyRow {
  id: string
  label: string
  access_level: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface McpKeyCreated extends McpKeyRow {
  secret: string
}

export async function listMcpKeys(studioId: string): Promise<McpKeyRow[]> {
  return request<McpKeyRow[]>('GET', `/studios/${studioId}/mcp-keys`)
}

export async function createMcpKey(
  studioId: string,
  body: { label: string; access_level?: 'viewer' | 'editor' },
): Promise<McpKeyCreated> {
  return request<McpKeyCreated>('POST', `/studios/${studioId}/mcp-keys`, body)
}

export async function revokeMcpKey(
  studioId: string,
  keyId: string,
): Promise<void> {
  return request<void>('DELETE', `/studios/${studioId}/mcp-keys/${keyId}`)
}

// --- Sections (under /projects/{project_id}) ---

export interface SectionCreateBody {
  title: string
  slug?: string | null
}

export interface SectionUpdateBody {
  title?: string | null
  slug?: string | null
  order?: number | null
  content?: string | null
}

export interface SectionOutlineHealthLite {
  drift_count: number
  gap_count: number
  token_used: number
  token_budget: number
  citation_scan_pending: boolean
}

export interface Section {
  id: string
  project_id: string
  title: string
  slug: string
  order: number
  content: string
  status: SectionStatus
  open_issue_count: number
  outline_health?: SectionOutlineHealthLite | null
  created_at: string
  updated_at: string
}

export type ContextBlockKind =
  | 'software_def'
  | 'outline'
  | 'current_section'
  | 'other_section'
  | 'artifact_chunk'
  | 'git_history'
  | 'retrieved_header'

export interface ContextBlock {
  label: string
  kind: ContextBlockKind
  tokens: number
  relevance: number | null
  truncated: boolean
  body: string
}

export interface ContextPreview {
  blocks: ContextBlock[]
  total_tokens: number
  budget_tokens: number
  overflow_strategy_applied: string | null
  /** Dev/staging only: same truncated string as RAGService.build_context when requested. */
  debug_raw_rag_text?: string | null
}

export async function getContextPreview(
  projectId: string,
  sectionId: string,
  opts?: {
    q?: string
    tokenBudget?: number
    includeGitHistory?: boolean
    /** Non-production API: adds debug_raw_rag_text to the response. */
    debugRawRag?: boolean
  },
): Promise<ContextPreview> {
  const sp = new URLSearchParams()
  if (opts?.q != null && opts.q !== '') {
    sp.set('q', opts.q)
  }
  if (opts?.tokenBudget != null) {
    sp.set('token_budget', String(opts.tokenBudget))
  }
  if (opts?.includeGitHistory === true) {
    sp.set('include_git_history', 'true')
  }
  if (opts?.debugRawRag === true) {
    sp.set('debug_raw_rag', 'true')
  }
  const qs = sp.toString()
  const suffix = qs ? `?${qs}` : ''
  return request<ContextPreview>(
    'GET',
    `/projects/${projectId}/sections/${sectionId}/context-preview${suffix}`,
  )
}

export interface SectionHealth {
  drift_count: number
  gap_count: number
  token_used: number
  token_budget: number
  citations_resolved: number
  citations_missing: number
  drawer_drift: string | null
  drawer_gap: string | null
  drawer_tokens: string | null
  drawer_sources: string | null
}

export async function getSectionHealth(
  projectId: string,
  sectionId: string,
  opts?: { tokenBudget?: number },
): Promise<SectionHealth> {
  const sp = new URLSearchParams()
  if (opts?.tokenBudget != null) {
    sp.set('token_budget', String(opts.tokenBudget))
  }
  const qs = sp.toString()
  const suffix = qs ? `?${qs}` : ''
  return request<SectionHealth>(
    'GET',
    `/projects/${projectId}/sections/${sectionId}/health${suffix}`,
  )
}

export interface CitationMissingItem {
  statement: string
}

export interface CitationHealth {
  citations_resolved: number
  citations_missing: number
  missing_items: CitationMissingItem[]
}

export async function getCitationHealth(
  projectId: string,
  sectionId: string,
): Promise<CitationHealth> {
  return request<CitationHealth>(
    'GET',
    `/projects/${projectId}/sections/${sectionId}/citation-health`,
  )
}

export interface SectionContextPreferences {
  excluded_kinds: string[]
  pinned_artifact_ids: string[]
  pinned_section_ids: string[]
  pinned_work_order_ids: string[]
  extra_urls: { url: string; note?: string }[]
}

export interface SectionContextPreferencesPatch {
  excluded_kinds?: string[] | null
  pinned_artifact_ids?: string[] | null
  pinned_section_ids?: string[] | null
  pinned_work_order_ids?: string[] | null
  extra_urls?: { url: string; note?: string }[] | null
}

export async function getSectionContextPreferences(
  projectId: string,
  sectionId: string,
): Promise<SectionContextPreferences> {
  return request<SectionContextPreferences>(
    'GET',
    `/projects/${projectId}/sections/${sectionId}/context-preferences`,
  )
}

export async function patchSectionContextPreferences(
  projectId: string,
  sectionId: string,
  body: SectionContextPreferencesPatch,
): Promise<SectionContextPreferences> {
  return request<SectionContextPreferences>(
    'PATCH',
    `/projects/${projectId}/sections/${sectionId}/context-preferences`,
    body,
  )
}

export interface SectionImproveBody {
  instruction?: string | null
  current_section_plaintext?: string | null
}

export interface SectionImproveResponse {
  improved_markdown: string
}

export async function improveSection(
  projectId: string,
  sectionId: string,
  body: SectionImproveBody,
): Promise<SectionImproveResponse> {
  return request<SectionImproveResponse>(
    'POST',
    `/projects/${projectId}/sections/${sectionId}/improve`,
    body,
  )
}

export async function listSections(
  projectId: string,
  opts?: { includeOutlineHealth?: boolean },
): Promise<Section[]> {
  const sp = new URLSearchParams()
  if (opts?.includeOutlineHealth) {
    sp.set('include_outline_health', 'true')
  }
  const qs = sp.toString()
  const suffix = qs ? `?${qs}` : ''
  return request<Section[]>('GET', `/projects/${projectId}/sections${suffix}`)
}

export async function createSection(
  projectId: string,
  body: SectionCreateBody,
): Promise<Section> {
  return request<Section>('POST', `/projects/${projectId}/sections`, body)
}

export async function getSection(
  projectId: string,
  sectionId: string,
): Promise<Section> {
  return request<Section>(
    'GET',
    `/projects/${projectId}/sections/${sectionId}`,
  )
}

export async function updateSection(
  projectId: string,
  sectionId: string,
  body: SectionUpdateBody,
): Promise<Section> {
  return request<Section>(
    'PATCH',
    `/projects/${projectId}/sections/${sectionId}`,
    body,
  )
}

export async function deleteSection(
  projectId: string,
  sectionId: string,
): Promise<void> {
  return request<void>(
    'DELETE',
    `/projects/${projectId}/sections/${sectionId}`,
  )
}

export async function reorderSections(
  projectId: string,
  sectionIds: string[],
): Promise<Section[]> {
  return request<Section[]>(
    'POST',
    `/projects/${projectId}/sections/reorder`,
    { section_ids: sectionIds },
  )
}

// --- Artifacts (under /projects/{project_id}) ---

export interface ArtifactItem {
  id: string
  project_id: string | null
  scope_level?: ArtifactScopeLevel
  name: string
  file_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
  chunking_strategy?: string | null
  embedding_status?: EmbeddingStatus | null
  embedded_at?: string | null
  chunk_count?: number | null
  extracted_char_count?: number | null
}

export async function listArtifacts(projectId: string): Promise<ArtifactItem[]> {
  return request<ArtifactItem[]>('GET', `/projects/${projectId}/artifacts`)
}

export interface ChunkPreview {
  chunk_index: number
  content: string
  content_length: number
}

export interface ArtifactDetail {
  id: string
  project_id: string | null
  scope_level: ArtifactScopeLevel
  context_studio_id: string
  context_software_id: string | null
  name: string
  file_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
  chunking_strategy?: string | null
  embedding_status: EmbeddingStatus | null
  embedded_at: string | null
  chunk_count: number | null
  extracted_char_count: number | null
  embedding_error: string | null
  chunk_previews: ChunkPreview[]
}

export async function getArtifactDetail(
  projectId: string,
  artifactId: string,
): Promise<ArtifactDetail> {
  return request<ArtifactDetail>(
    'GET',
    `/projects/${projectId}/artifacts/${artifactId}`,
  )
}

export async function getArtifactDetailById(
  artifactId: string,
): Promise<ArtifactDetail> {
  return request<ArtifactDetail>('GET', `/artifacts/${artifactId}`)
}

export interface ArtifactChunkingStrategiesResponse {
  strategies: string[]
}

export async function listArtifactChunkingStrategies(): Promise<ArtifactChunkingStrategiesResponse> {
  return request<ArtifactChunkingStrategiesResponse>(
    'GET',
    '/artifacts/chunking-strategies',
  )
}

export async function deleteArtifactById(artifactId: string): Promise<void> {
  return request<void>('DELETE', `/artifacts/${artifactId}`)
}

export async function reindexArtifactById(artifactId: string): Promise<void> {
  return request<void>('POST', `/artifacts/${artifactId}/reindex`)
}

export async function reindexProjectArtifact(
  projectId: string,
  artifactId: string,
): Promise<void> {
  return request<void>(
    'POST',
    `/projects/${projectId}/artifacts/${artifactId}/reindex`,
  )
}

export async function patchArtifactChunkingStrategy(
  artifactId: string,
  body: { chunking_strategy: string | null },
): Promise<ArtifactDetail> {
  return request<ArtifactDetail>(
    'PATCH',
    `/artifacts/${artifactId}/chunking-strategy`,
    body,
  )
}

export async function patchArtifactScope(
  artifactId: string,
  body: {
    scope_level: ArtifactScopeLevel
    software_id?: string | null
    project_id?: string | null
  },
): Promise<ArtifactDetail> {
  return request<ArtifactDetail>('PATCH', `/artifacts/${artifactId}/scope`, body)
}

export async function uploadArtifact(
  projectId: string,
  file: File,
  displayName?: string,
): Promise<ArtifactItem> {
  const fd = new FormData()
  fd.append('file', file)
  if (displayName?.trim()) {
    fd.append('name', displayName.trim())
  }
  const r = await fetch(base() + `/projects/${projectId}/artifacts`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  const text = await r.text()
  if (!r.ok) {
    let err: AuthErrorBody = {
      detail: r.statusText,
      code: 'HTTP_ERROR',
    }
    if (text) {
      try {
        err = JSON.parse(text) as AuthErrorBody
      } catch {
        err = { detail: text, code: 'HTTP_ERROR' }
      }
    }
    throw err
  }
  return JSON.parse(text) as ArtifactItem
}

export async function createMarkdownArtifact(
  projectId: string,
  body: { name: string; content: string },
): Promise<ArtifactItem> {
  return request<ArtifactItem>(
    'POST',
    `/projects/${projectId}/artifacts/md`,
    body,
  )
}

export async function deleteArtifact(
  projectId: string,
  artifactId: string,
): Promise<void> {
  return request<void>(
    'DELETE',
    `/projects/${projectId}/artifacts/${artifactId}`,
  )
}

// --- Work orders (under /projects/{project_id}) ---

export type WorkOrderStatus =
  | 'backlog'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'archived'

export interface WorkOrder {
  id: string
  project_id: string
  title: string
  description: string
  implementation_guide: string | null
  acceptance_criteria: string | null
  status: string
  phase: string | null
  phase_order: number | null
  assignee_id: string | null
  assignee_display_name: string | null
  is_stale: boolean
  stale_reason: string | null
  created_by: string | null
  updated_by_id: string | null
  updated_by_display_name: string | null
  created_at: string
  updated_at: string
  section_ids: string[]
}

export interface WorkOrderNote {
  id: string
  author_id: string | null
  source: string
  content: string
  created_at: string
}

export interface WorkOrderDetail extends WorkOrder {
  notes: WorkOrderNote[]
}

export interface WorkOrderCreateBody {
  title: string
  description: string
  implementation_guide?: string | null
  acceptance_criteria?: string | null
  status?: string
  phase?: string | null
  phase_order?: number | null
  assignee_id?: string | null
  section_ids?: string[]
}

export interface WorkOrderUpdateBody {
  title?: string | null
  description?: string | null
  implementation_guide?: string | null
  acceptance_criteria?: string | null
  status?: string | null
  phase?: string | null
  phase_order?: number | null
  assignee_id?: string | null
  section_ids?: string[] | null
}

export interface WorkOrderListFilters {
  status?: string
  assignee_id?: string
  phase?: string
  is_stale?: boolean
  section_id?: string
}

function workOrdersQueryString(f?: WorkOrderListFilters): string {
  if (!f) {
    return ''
  }
  const p = new URLSearchParams()
  if (f.status) {
    p.set('status', f.status)
  }
  if (f.assignee_id) {
    p.set('assignee_id', f.assignee_id)
  }
  if (f.phase) {
    p.set('phase', f.phase)
  }
  if (f.is_stale !== undefined) {
    p.set('is_stale', String(f.is_stale))
  }
  if (f.section_id) {
    p.set('section_id', f.section_id)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function listWorkOrders(
  projectId: string,
  filters?: WorkOrderListFilters,
): Promise<WorkOrder[]> {
  return request<WorkOrder[]>(
    'GET',
    `/projects/${projectId}/work-orders${workOrdersQueryString(filters)}`,
  )
}

export async function getWorkOrder(
  projectId: string,
  workOrderId: string,
): Promise<WorkOrderDetail> {
  return request<WorkOrderDetail>(
    'GET',
    `/projects/${projectId}/work-orders/${workOrderId}`,
  )
}

export async function createWorkOrder(
  projectId: string,
  body: WorkOrderCreateBody,
): Promise<WorkOrder> {
  return request<WorkOrder>('POST', `/projects/${projectId}/work-orders`, body)
}

export async function updateWorkOrder(
  projectId: string,
  workOrderId: string,
  body: WorkOrderUpdateBody,
): Promise<WorkOrder> {
  return request<WorkOrder>(
    'PUT',
    `/projects/${projectId}/work-orders/${workOrderId}`,
    body,
  )
}

export async function deleteWorkOrder(
  projectId: string,
  workOrderId: string,
): Promise<void> {
  return request<void>(
    'DELETE',
    `/projects/${projectId}/work-orders/${workOrderId}`,
  )
}

export async function generateWorkOrders(
  projectId: string,
  body: { section_ids: string[] },
): Promise<WorkOrder[]> {
  return request<WorkOrder[]>(
    'POST',
    `/projects/${projectId}/work-orders/generate`,
    body,
  )
}

export async function dismissWorkOrderStale(
  projectId: string,
  workOrderId: string,
): Promise<WorkOrder> {
  return request<WorkOrder>(
    'POST',
    `/projects/${projectId}/work-orders/${workOrderId}/dismiss-stale`,
  )
}

export async function addWorkOrderNote(
  projectId: string,
  workOrderId: string,
  body: { content: string },
): Promise<WorkOrderNote> {
  return request<WorkOrderNote>(
    'POST',
    `/projects/${projectId}/work-orders/${workOrderId}/notes`,
    body,
  )
}

// --- Private thread (Slice 6) ---

export interface PrivateThreadMessage {
  id: string
  role: string
  content: string
  created_at: string
}

export interface PrivateThreadDetail {
  thread_id: string
  messages: PrivateThreadMessage[]
}

export async function getPrivateThread(
  projectId: string,
  sectionId: string,
): Promise<PrivateThreadDetail> {
  return request<PrivateThreadDetail>(
    'GET',
    `/projects/${projectId}/sections/${sectionId}/thread`,
  )
}

export async function resetPrivateThread(
  projectId: string,
  sectionId: string,
): Promise<void> {
  return request<void>(
    'DELETE',
    `/projects/${projectId}/sections/${sectionId}/thread`,
  )
}

export interface PrivateThreadStreamPayload {
  content: string
  current_section_plaintext?: string
  include_git_history?: boolean
  selection_from?: number
  selection_to?: number
  selected_plaintext?: string
  include_selection_in_context?: boolean
  thread_intent?: 'ask' | 'append' | 'replace_selection' | 'edit'
  command?: 'none' | 'improve' | 'critique'
}

export async function streamPrivateThreadReply(
  projectId: string,
  sectionId: string,
  payload: PrivateThreadStreamPayload,
  handlers: {
    onToken: (text: string) => void
    onMeta: (meta: PrivateThreadStreamMeta) => void
  },
): Promise<void> {
  const r = await fetch(
    base() +
      `/projects/${projectId}/sections/${sectionId}/thread/messages`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  await throwIfNotOk(r)
  const reader = r.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }
  await consumePrivateThreadSseBody(reader, handlers)
}

export async function downloadArtifactBlob(
  projectId: string,
  artifactId: string,
): Promise<Blob> {
  const r = await fetch(
    base() +
      `/projects/${projectId}/artifacts/${artifactId}/download`,
    { credentials: 'include' },
  )
  await throwIfNotOk(r)
  return r.blob()
}

/** Download any artifact the user may read (project, software, or studio scope). */
export async function downloadArtifactBlobById(artifactId: string): Promise<Blob> {
  const r = await fetch(base() + `/artifacts/${artifactId}/download`, {
    credentials: 'include',
  })
  await throwIfNotOk(r)
  return r.blob()
}
