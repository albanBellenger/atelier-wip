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

function appendTokenUsageParams(
  sp: URLSearchParams,
  params: TokenUsageQueryParams | undefined,
): void {
  if (!params) return
  const entries: [string, string | number | undefined][] = [
    ['studio_id', params.studio_id],
    ['software_id', params.software_id],
    ['project_id', params.project_id],
    ['user_id', params.user_id],
    ['call_type', params.call_type],
    ['date_from', params.date_from],
    ['date_to', params.date_to],
    ['limit', params.limit],
    ['offset', params.offset],
  ]
  for (const [k, v] of entries) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
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

export interface TokenUsageQueryParams {
  studio_id?: string
  software_id?: string
  project_id?: string
  user_id?: string
  call_type?: string
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
  params?: Omit<TokenUsageQueryParams, 'studio_id' | 'user_id'>,
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
  params?: Omit<TokenUsageQueryParams, 'studio_id' | 'user_id'>,
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

export async function postAdminTestLlm(): Promise<AdminConnectivityResult> {
  return request<AdminConnectivityResult>('POST', '/admin/test/llm')
}

export async function postAdminTestEmbedding(): Promise<AdminConnectivityResult> {
  return request<AdminConnectivityResult>('POST', '/admin/test/embedding')
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
}

export interface ProjectUpdateBody {
  name?: string | null
  description?: string | null
}

export type SectionStatus = 'ready' | 'gaps' | 'conflict' | 'empty'

export interface SectionSummary {
  id: string
  title: string
  slug: string
  order: number
  status: SectionStatus
}

export interface Project {
  id: string
  software_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  sections: SectionSummary[] | null
}

export async function listProjects(softwareId: string): Promise<Project[]> {
  return request<Project[]>('GET', `/software/${softwareId}/projects`)
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

export async function listProjectIssues(projectId: string): Promise<IssueRow[]> {
  return request<IssueRow[]>('GET', `/projects/${projectId}/issues`)
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

export interface Section {
  id: string
  project_id: string
  title: string
  slug: string
  order: number
  content: string
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
}

export async function getContextPreview(
  projectId: string,
  sectionId: string,
  opts?: {
    q?: string
    tokenBudget?: number
    includeGitHistory?: boolean
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
  const qs = sp.toString()
  const suffix = qs ? `?${qs}` : ''
  return request<ContextPreview>(
    'GET',
    `/projects/${projectId}/sections/${sectionId}/context-preview${suffix}`,
  )
}

export async function listSections(projectId: string): Promise<Section[]> {
  return request<Section[]>('GET', `/projects/${projectId}/sections`)
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
  project_id: string
  name: string
  file_type: string
  uploaded_by: string | null
  created_at: string
}

export async function listArtifacts(projectId: string): Promise<ArtifactItem[]> {
  return request<ArtifactItem[]>('GET', `/projects/${projectId}/artifacts`)
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
  if (!r.ok) {
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
  if (!r.ok) {
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
  return r.blob()
}
