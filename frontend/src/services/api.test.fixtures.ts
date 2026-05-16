/**
 * MSW handlers + batched API calls to exercise thin `request()` wrappers in `api.ts`.
 * Imported only from `api.test.ts`.
 */

import { http, HttpResponse } from 'msw'
import type { RequestHandler } from 'msw'

import type * as Api from './api'

function emptyTokenReport(): Api.TokenUsageReport {
  return {
    rows: [],
    totals: {
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: '0',
    },
  }
}

function studio(): Api.Studio {
  return {
    id: 'st1',
    name: 'S',
    description: null,
    logo_path: null,
    created_at: '',
  }
}

function studioListRow(): Api.StudioListItem {
  return {
    ...studio(),
    software_count: 0,
    project_count: 0,
    member_count: 0,
  }
}

function software(): Api.Software {
  return {
    id: 'sw1',
    studio_id: 'st1',
    name: 'Sw',
    description: null,
    definition: null,
    git_provider: null,
    git_repo_url: null,
    git_branch: null,
    git_token_set: false,
    created_at: '',
    updated_at: '',
  }
}

function project(): Api.Project {
  return {
    id: 'p1',
    software_id: 'sw1',
    name: 'P',
    description: null,
    publish_folder_slug: 'pub',
    archived: false,
    created_at: '',
    updated_at: '',
    sections: null,
    work_orders_done: 0,
    work_orders_total: 0,
    sections_count: 0,
    last_edited_at: null,
  }
}

function section(): Api.Section {
  return {
    id: 'sec1',
    project_id: 'p1',
    title: 'T',
    slug: 't',
    order: 0,
    content: '',
    created_at: '',
    updated_at: '',
  }
}

function workOrder(): Api.WorkOrder {
  return {
    id: 'wo1',
    project_id: 'p1',
    title: 'W',
    description: '',
    implementation_guide: null,
    acceptance_criteria: null,
    status: 'backlog',
    phase: null,
    phase_order: null,
    assignee_id: null,
    assignee_display_name: null,
    is_stale: false,
    stale_reason: null,
    created_by: null,
    updated_by_id: null,
    updated_by_display_name: null,
    created_at: '',
    updated_at: '',
    section_ids: [],
  }
}

function workOrderDetail(): Api.WorkOrderDetail {
  return { ...workOrder(), notes: [] }
}

function artifactItem(): Api.ArtifactItem {
  return {
    id: 'art1',
    project_id: 'p1',
    name: 'a',
    file_type: 'txt',
    size_bytes: 1,
    uploaded_by: null,
    created_at: '',
  }
}

function artifactDetail(): Api.ArtifactDetail {
  return {
    id: 'art1',
    project_id: 'p1',
    scope_level: 'project',
    context_studio_id: 'st1',
    context_software_id: 'sw1',
    name: 'a',
    file_type: 'txt',
    size_bytes: 1,
    uploaded_by: null,
    created_at: '',
    embedding_status: 'embedded',
    embedded_at: null,
    chunk_count: null,
    extracted_char_count: null,
    embedding_error: null,
    chunk_previews: [],
  }
}

function attentionCounts(): Api.AttentionCounts {
  return { all: 0, conflict: 0, drift: 0, gap: 0, update: 0 }
}

/** MSW handlers for fixed ids st1 / sw1 / p1 / sec1 / art1 / wo1 / iss1 / grant1 / key1 */
export function apiCoverageHandlers(): RequestHandler[] {
  const embeddingLibrary: Api.AdminEmbeddingLibraryStudioRow[] = [
    {
      studio_id: 'st-lib',
      studio_name: 'Demo Studio',
      artifact_count: 0,
      embedded_artifact_count: 0,
      artifact_vector_chunks: 0,
      section_vector_chunks: 0,
    },
  ]

  const codebaseOverview: Api.AdminCodebaseStudioRow[] = [
    {
      studio_id: 'st1',
      studio_name: 'Studio One',
      software: [
        {
          software_id: 'sw1',
          software_name: 'Product',
          git_configured: true,
          ready_file_count: 2,
          ready_chunk_count: 5,
          ready_symbol_count: 1,
          commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
          branch: 'main',
          ready_at: '2026-01-01T00:00:00Z',
          newest_snapshot_status: 'ready',
        },
      ],
    },
  ]

  const reindexPolicy: Api.EmbeddingReindexPolicy = {
    id: 1,
    auto_reindex_trigger: 'manual',
    debounce_seconds: 60,
    drift_threshold_pct: '10.00',
    retention_days: 30,
  }

  const connectivity: Api.AdminConnectivityResult = {
    ok: true,
    message: 'ok',
    detail: null,
  }

  const attentionProject: Api.ProjectAttentionResponse = {
    studio_id: 'st1',
    software_id: 'sw1',
    project_id: 'p1',
    counts: attentionCounts(),
    items: [],
  }

  const attentionSoftware: Api.SoftwareAttentionResponse = {
    studio_id: 'st1',
    software_id: 'sw1',
    counts: attentionCounts(),
    items: [],
  }

  const activity: Api.SoftwareActivityResponse = { items: [] }

  const softwareArtifact: Api.SoftwareArtifactRow = {
    id: 'art1',
    project_id: 'p1',
    project_name: 'P',
    name: 'a',
    file_type: 'txt',
    size_bytes: 1,
    uploaded_by: null,
    uploaded_by_display: null,
    created_at: '',
    scope_level: 'project',
    excluded_at_software: null,
    excluded_at_project: null,
  }

  const studioArtifact: Api.StudioArtifactRow = {
    ...softwareArtifact,
    software_id: 'sw1',
    software_name: 'Sw',
  }

  const mcpRow: Api.McpKeyRow = {
    id: 'key1',
    label: 'k',
    access_level: 'viewer',
    created_at: '',
    last_used_at: null,
    revoked_at: null,
  }

  const crossIncoming: Api.CrossStudioIncomingRow = {
    id: 'grant1',
    requesting_studio_name: 'A',
    requester_email: 'a@b.com',
    target_software_name: 'Sw',
    access_level: 'viewer',
    status: 'pending',
    created_at: '',
    resolved_at: null,
  }

  const crossOutgoing: Api.CrossStudioOutgoingRow = {
    id: 'grant1',
    target_software_name: 'Sw',
    owner_studio_name: 'O',
    access_level: 'viewer',
    status: 'pending',
    created_at: '',
    resolved_at: null,
  }

  const crossResolve: Api.CrossStudioRequestResult = {
    id: 'grant1',
    status: 'approved',
    access_level: 'viewer',
  }

  const issue: Api.IssueRow = {
    id: 'iss1',
    project_id: 'p1',
    software_id: 'sw1',
    work_order_id: null,
    kind: 'conflict_or_gap',
    triggered_by: null,
    section_a_id: null,
    section_b_id: null,
    description: '',
    status: 'open',
    origin: 'test',
    run_actor_id: null,
    payload_json: null,
    resolution_reason: null,
    created_at: '',
  }

  const graph: Api.ProjectGraphResponse = { nodes: [], edges: [] }

  const chatProj: Api.ProjectChatHistoryResponse = {
    messages: [],
    next_before: null,
  }

  const chatSoft: Api.SoftwareChatHistoryResponse = {
    messages: [],
    next_before: null,
  }

  const chunkStrategies: Api.ArtifactChunkingStrategiesResponse = {
    strategies: ['fixed'],
  }

  const gitHist = { commits: [] as Api.GitCommitItem[] }

  const softTok: Api.SoftwareTokenUsageSummary = {
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: '0',
    period_start: '',
    period_end: '',
  }

  const preview: Api.ContextPreview = {
    blocks: [],
    total_tokens: 0,
    budget_tokens: 0,
    overflow_strategy_applied: null,
  }

  const exclusion: Api.ArtifactExclusionPatchResult = {
    artifact_id: 'art1',
    excluded: false,
  }

  const privateThread: Api.PrivateThreadDetail = {
    thread_id: 't1',
    messages: [],
  }

  const studioMember: Api.StudioMember = {
    user_id: 'u1',
    email: 'a@b.com',
    display_name: 'A',
    role: 'studio_member',
    joined_at: '',
  }

  const studioCaps: Api.StudioCapabilitiesOut = {
    is_platform_admin: false,
    membership_role: 'studio_admin',
    is_studio_admin: true,
    is_studio_editor: true,
    is_studio_member: true,
    is_studio_viewer: false,
    is_cross_studio_viewer: false,
    can_publish: true,
    can_edit_software_definition: true,
    can_create_project: true,
    can_manage_project_outline: true,
    cross_studio_grant: null,
  }

  return [
    http.get('http://api.test/auth/llm-runtime', () =>
      HttpResponse.json({ llm_provider: null, llm_model: null }),
    ),
    http.get('http://api.test/admin/embeddings/library', () =>
      HttpResponse.json(embeddingLibrary),
    ),
    http.get('http://api.test/admin/embeddings/reindex-policy', () =>
      HttpResponse.json(reindexPolicy),
    ),
    http.patch('http://api.test/admin/embeddings/reindex-policy', () =>
      HttpResponse.json(reindexPolicy),
    ),
    http.get('http://api.test/admin/codebase/overview', () =>
      HttpResponse.json(codebaseOverview),
    ),
    http.post('http://api.test/admin/codebase/software/:softwareId/reindex', () =>
      HttpResponse.json({
        id: 'snap-new',
        software_id: 'sw1',
        commit_sha: 'c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff',
        branch: 'main',
        status: 'pending',
        error_message: null,
        created_at: '2026-01-02T00:00:00Z',
        ready_at: null,
        file_count: 0,
        chunk_count: 0,
      }),
    ),
    http.post('http://api.test/admin/test/llm', () => HttpResponse.json(connectivity)),
    http.post('http://api.test/admin/test/embedding', () =>
      HttpResponse.json(connectivity),
    ),
    http.get('http://api.test/studios/st1/cross-studio-incoming', () =>
      HttpResponse.json([crossIncoming]),
    ),
    http.put('http://api.test/studios/st1/cross-studio-incoming/grant1', () =>
      HttpResponse.json(crossResolve),
    ),
    http.get('http://api.test/studios/st1/cross-studio-outgoing', () =>
      HttpResponse.json([crossOutgoing]),
    ),
    http.get('http://api.test/studios/st1/token-usage', ({ request }) =>
      request.headers.get('Accept')?.includes('csv')
        ? new HttpResponse(new TextEncoder().encode(''), {
            headers: { 'Content-Type': 'text/csv' },
          })
        : HttpResponse.json(emptyTokenReport()),
    ),
    http.post('http://api.test/studios/st1/cross-studio-request', () =>
      HttpResponse.json(crossResolve),
    ),
    http.get('http://api.test/studios/st1/me/capabilities', () =>
      HttpResponse.json(studioCaps),
    ),
    http.get('http://api.test/studios', () => HttpResponse.json([studioListRow()])),
    http.post('http://api.test/admin/studios', () => HttpResponse.json(studio())),
    http.get('http://api.test/studios/st1', () => HttpResponse.json(studio())),
    http.patch('http://api.test/studios/st1', () => HttpResponse.json(studio())),
    http.delete('http://api.test/admin/studios/st1', () => new HttpResponse(null, { status: 204 })),
    http.get('http://api.test/studios/st1/members', () => HttpResponse.json([studioMember])),
    http.post('http://api.test/studios/st1/members', () => HttpResponse.json(studioMember)),
    http.delete('http://api.test/studios/st1/members/u1', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.patch('http://api.test/studios/st1/members/u1', () =>
      HttpResponse.json(studioMember),
    ),
    http.get('http://api.test/studios/st1/software', () => HttpResponse.json([software()])),
    http.post('http://api.test/studios/st1/software', () => HttpResponse.json(software())),
    http.get('http://api.test/studios/st1/software/sw1', () =>
      HttpResponse.json(software()),
    ),
    http.put('http://api.test/studios/st1/software/sw1', () =>
      HttpResponse.json(software()),
    ),
    http.delete('http://api.test/studios/st1/software/sw1', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.post('http://api.test/studios/st1/software/sw1/git/test', () =>
      HttpResponse.json({ ok: true, message: 'ok' }),
    ),
    http.get('http://api.test/studios/st1/projects', () => HttpResponse.json([])),
    http.get('http://api.test/software/sw1/projects', () => HttpResponse.json([project()])),
    http.post('http://api.test/software/sw1/projects', () => HttpResponse.json(project())),
    http.get('http://api.test/software/sw1/projects/p1', () => HttpResponse.json(project())),
    http.get('http://api.test/software/sw1/codebase/snapshots', () =>
      HttpResponse.json([
        {
          id: 'snap1',
          software_id: 'sw1',
          commit_sha: 'a'.repeat(40),
          branch: 'main',
          status: 'ready',
          error_message: null,
          created_at: '',
          ready_at: '',
          file_count: 1,
          chunk_count: 1,
        },
      ]),
    ),
    http.post('http://api.test/software/sw1/codebase/code-drift/run', () =>
      HttpResponse.json({
        skipped_reason: null,
        sections_evaluated: 1,
        sections_flagged: 0,
        work_orders_evaluated: 0,
        work_orders_flagged: 0,
      }),
    ),
    http.put('http://api.test/software/sw1/projects/p1', () =>
      HttpResponse.json(project()),
    ),
    http.patch('http://api.test/software/sw1/projects/p1', () =>
      HttpResponse.json(project()),
    ),
    http.delete('http://api.test/software/sw1/projects/p1', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.get('http://api.test/projects/p1/graph', () => HttpResponse.json(graph)),
    http.get('http://api.test/projects/p1/chat', () => HttpResponse.json(chatProj)),
    http.get('http://api.test/software/sw1/chat', () => HttpResponse.json(chatSoft)),
    http.post('http://api.test/me/builder-composer-hint', () =>
      HttpResponse.json({ headline: 'h', input_placeholder: 'p' }),
    ),
    http.post('http://api.test/projects/p1/publish', () =>
      HttpResponse.json({ commit_url: 'http://c', files_committed: 1 }),
    ),
    http.get('http://api.test/projects/p1/issues', () => HttpResponse.json([issue])),
    http.put('http://api.test/projects/p1/issues/iss1', () => HttpResponse.json(issue)),
    http.post('http://api.test/projects/p1/analyze', () =>
      HttpResponse.json({ issues_created: 0 }),
    ),
    http.get('http://api.test/projects/p1/attention', () =>
      HttpResponse.json(attentionProject),
    ),
    http.get('http://api.test/software/sw1/attention', () =>
      HttpResponse.json(attentionSoftware),
    ),
    http.get('http://api.test/software/sw1/activity', () => HttpResponse.json(activity)),
    http.get('http://api.test/studios/st1/activity', () => HttpResponse.json(activity)),
    http.get('http://api.test/software/sw1/artifacts', () =>
      HttpResponse.json([softwareArtifact]),
    ),
    http.get('http://api.test/studios/st1/artifacts', () =>
      HttpResponse.json([studioArtifact]),
    ),
    http.get('http://api.test/studios/st1/artifact-library', () =>
      HttpResponse.json([studioArtifact]),
    ),
    http.post('http://api.test/studios/st1/artifacts/md', () =>
      HttpResponse.json(artifactItem()),
    ),
    http.post('http://api.test/software/sw1/artifacts/md', () =>
      HttpResponse.json(artifactItem()),
    ),
    http.patch('http://api.test/studios/st1/software/sw1/artifact-exclusions', () =>
      HttpResponse.json(exclusion),
    ),
    http.patch(
      'http://api.test/studios/st1/software/sw1/projects/p1/artifact-exclusions',
      () => HttpResponse.json(exclusion),
    ),
    http.get(
      'http://api.test/studios/st1/software/sw1/token-usage/summary',
      () => HttpResponse.json(softTok),
    ),
    http.get('http://api.test/studios/st1/software/sw1/history', () =>
      HttpResponse.json(gitHist),
    ),
    http.get('http://api.test/studios/st1/mcp-keys', () => HttpResponse.json([mcpRow])),
    http.post('http://api.test/studios/st1/mcp-keys', () =>
      HttpResponse.json({
        ...mcpRow,
        secret: 's',
      }),
    ),
    http.delete('http://api.test/studios/st1/mcp-keys/key1', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.get('http://api.test/projects/p1/sections/sec1/context-preview', () =>
      HttpResponse.json(preview),
    ),
    http.get('http://api.test/projects/p1/chat/rag-preview', () =>
      HttpResponse.json(preview),
    ),
    http.post('http://api.test/projects/p1/sections/sec1/improve', () =>
      HttpResponse.json({ improved_markdown: 'x' }),
    ),
    http.get('http://api.test/projects/p1/sections', () => HttpResponse.json([section()])),
    http.post('http://api.test/projects/p1/sections', () => HttpResponse.json(section())),
    http.get('http://api.test/projects/p1/sections/sec1', () =>
      HttpResponse.json(section()),
    ),
    http.patch('http://api.test/projects/p1/sections/sec1', () =>
      HttpResponse.json(section()),
    ),
    http.delete('http://api.test/projects/p1/sections/sec1', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.post('http://api.test/projects/p1/sections/reorder', () =>
      HttpResponse.json([section()]),
    ),
    http.get('http://api.test/projects/p1/artifacts', () =>
      HttpResponse.json([artifactItem()]),
    ),
    http.get('http://api.test/projects/p1/artifacts/art1', () =>
      HttpResponse.json(artifactDetail()),
    ),
    http.get('http://api.test/artifacts/art1', () => HttpResponse.json(artifactDetail())),
    http.get('http://api.test/artifacts/chunking-strategies', () =>
      HttpResponse.json(chunkStrategies),
    ),
    http.delete('http://api.test/artifacts/art1', () => new HttpResponse(null, { status: 204 })),
    http.post('http://api.test/artifacts/art1/reindex', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.post('http://api.test/projects/p1/artifacts/art1/reindex', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.patch('http://api.test/artifacts/art1/chunking-strategy', () =>
      HttpResponse.json(artifactDetail()),
    ),
    http.patch('http://api.test/artifacts/art1/scope', () =>
      HttpResponse.json(artifactDetail()),
    ),
    http.post('http://api.test/projects/p1/artifacts/md', () =>
      HttpResponse.json(artifactItem()),
    ),
    http.delete('http://api.test/projects/p1/artifacts/art1', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.get('http://api.test/projects/p1/work-orders', () =>
      HttpResponse.json([workOrder()]),
    ),
    http.get('http://api.test/projects/p1/work-orders/wo1', () =>
      HttpResponse.json(workOrderDetail()),
    ),
    http.post('http://api.test/projects/p1/work-orders', () =>
      HttpResponse.json(workOrder()),
    ),
    http.put('http://api.test/projects/p1/work-orders/wo1', () =>
      HttpResponse.json(workOrder()),
    ),
    http.delete('http://api.test/projects/p1/work-orders/wo1', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.post('http://api.test/projects/p1/work-orders/generate', () =>
      HttpResponse.json([workOrder()]),
    ),
    http.post('http://api.test/projects/p1/work-orders/wo1/dismiss-stale', () =>
      HttpResponse.json(workOrder()),
    ),
    http.post('http://api.test/projects/p1/work-orders/wo1/notes', () =>
      HttpResponse.json({
        id: 'n1',
        author_id: null,
        source: 'user',
        content: 'c',
        created_at: '',
      }),
    ),
    http.get('http://api.test/projects/p1/sections/sec1/thread', () =>
      HttpResponse.json(privateThread),
    ),
    http.delete('http://api.test/projects/p1/sections/sec1/thread', () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.post('http://api.test/auth/register', () =>
      HttpResponse.json({ message: 'ok' }),
    ),
    http.post('http://api.test/auth/login', () => HttpResponse.json({ message: 'ok' })),
    http.post('http://api.test/auth/logout', () => HttpResponse.json({ message: 'ok' })),
    http.get('http://api.test/generic/ping', () => HttpResponse.json({ ok: true })),
    http.post('http://api.test/generic/ping', () => HttpResponse.json({ ok: true })),
    http.put('http://api.test/generic/ping', () => HttpResponse.json({ ok: true })),
    http.patch('http://api.test/generic/ping', () => HttpResponse.json({ ok: true })),
    http.delete('http://api.test/generic/ping', () => new HttpResponse(null, { status: 204 })),
  ]
}

/** Invoke thin `request()` exports (fixed ids). Skips helpers covered elsewhere (streaming, raw fetch uploads). */
export async function invokeThinApiCoverage(api: typeof import('./api')): Promise<void> {
  await api.register({
    email: 'n@e.com',
    password: 'pw',
    display_name: 'N',
  })
  await api.login({ email: 'n@e.com', password: 'pw' })
  await api.logout()
  await api.getLlmRuntimeInfo()
  await api.getAdminEmbeddingLibrary()
  await api.getAdminEmbeddingReindexPolicy()
  await api.patchAdminEmbeddingReindexPolicy({})
  await api.getAdminCodebaseOverview()
  await api.postAdminCodebaseReindex('sw1')
  await api.postAdminTestLlm()
  await api.postAdminTestEmbedding()
  await api.getStudioCrossStudioIncoming('st1')
  await api.putStudioCrossStudioIncoming('st1', 'grant1', { decision: 'approve' })
  await api.getStudioCrossStudioOutgoing('st1')
  await api.getStudioTokenUsage('st1')
  await api.downloadStudioTokenUsageCsv('st1')
  await api.postStudioCrossStudioRequest('st1', { target_software_id: 'sw1' })
  await api.listStudios()
  await api.postAdminStudio({ name: 'S' })
  await api.getStudio('st1')
  await api.getStudioCapabilities('st1')
  await api.getStudioCapabilities('st1', 'sw1')
  await api.updateStudio('st1', { name: 'S2' })
  await api.listMembers('st1')
  await api.addMember('st1', { email: 'x@y.com', role: 'studio_member' })
  await api.removeMember('st1', 'u1')
  await api.updateMemberRole('st1', 'u1', 'studio_member')
  await api.listSoftware('st1')
  await api.createSoftware('st1', { name: 'Sw' })
  await api.getSoftware('st1', 'sw1')
  await api.updateSoftware('st1', 'sw1', { name: 'Z' })
  await api.testGitConnection('st1', 'sw1')
  await api.listStudioProjects('st1')
  await api.listProjects('sw1')
  await api.createProject('sw1', { name: 'P' })
  await api.getProject('sw1', 'p1')
  await api.updateProject('sw1', 'p1', { name: 'P2' })
  await api.patchProjectArchived('sw1', 'p1', false)
  await api.getProjectGraph('p1')
  await api.getProjectChat('p1')
  await api.getSoftwareChat('sw1')
  await api.postBuilderComposerHint({
    software_id: 'sw1',
    project_id: 'p1',
    local_hour: 9,
  })
  await api.publishProject('p1', {})
  await api.listProjectIssues('p1')
  await api.updateIssue('p1', 'iss1', 'resolved')
  await api.runProjectAnalyze('p1')
  await api.getProjectAttention('p1')
  await api.getSoftwareAttention('sw1')
  await api.getSoftwareActivity('sw1')
  await api.getStudioActivity('st1')
  await api.listSoftwareArtifacts('sw1')
  await api.listStudioArtifacts('st1')
  await api.listArtifactLibrary('st1')
  await api.createStudioMarkdownArtifact('st1', { name: 'n', content: 'c' })
  await api.createSoftwareMarkdownArtifact('sw1', { name: 'n', content: 'c' })
  await api.patchSoftwareArtifactExclusion('st1', 'sw1', {
    artifact_id: 'art1',
    excluded: false,
  })
  await api.patchProjectArtifactExclusion('st1', 'sw1', 'p1', {
    artifact_id: 'art1',
    excluded: false,
  })
  await api.getSoftwareTokenUsageSummary('st1', 'sw1')
  await api.getSoftwareGitHistory('st1', 'sw1')
  await api.listMcpKeys('st1')
  await api.createMcpKey('st1', { label: 'k' })
  await api.revokeMcpKey('st1', 'key1')
  await api.getContextPreview('p1', 'sec1')
  await api.getProjectChatRagPreview('p1')
  await api.improveSection('p1', 'sec1', {})
  await api.listSections('p1', { includeOutlineHealth: true })
  await api.createSection('p1', { title: 'T' })
  await api.getSection('p1', 'sec1')
  await api.updateSection('p1', 'sec1', { title: 'T2' })
  await api.reorderSections('p1', ['sec1'])
  await api.listArtifacts('p1')
  await api.getArtifactDetail('p1', 'art1')
  await api.getArtifactDetailById('art1')
  await api.listArtifactChunkingStrategies()
  await api.reindexArtifactById('art1')
  await api.reindexProjectArtifact('p1', 'art1')
  await api.patchArtifactChunkingStrategy('art1', { chunking_strategy: null })
  await api.patchArtifactScope('art1', { scope_level: 'project' })
  await api.createMarkdownArtifact('p1', { name: 'n', content: 'c' })
  await api.listWorkOrders('p1')
  await api.getWorkOrder('p1', 'wo1')
  await api.createWorkOrder('p1', { title: 't', description: 'd' })
  await api.updateWorkOrder('p1', 'wo1', { title: 't2' })
  await api.generateWorkOrders('p1', { section_ids: ['sec1'] })
  await api.dismissWorkOrderStale('p1', 'wo1')
  await api.addWorkOrderNote('p1', 'wo1', { content: 'n' })
  await api.getPrivateThread('p1', 'sec1')
  await api.resetPrivateThread('p1', 'sec1')
  await api.api.get<{ ok: boolean }>('/generic/ping')
  await api.api.post<{ ok: boolean }>('/generic/ping', {})
  await api.api.put<{ ok: boolean }>('/generic/ping', {})
  await api.api.patch<{ ok: boolean }>('/generic/ping', {})
  await api.api.delete<void>('/generic/ping')
  await api.deleteArtifactById('art1')
  await api.deleteArtifact('p1', 'art1')
  await api.deleteWorkOrder('p1', 'wo1')
  await api.deleteSection('p1', 'sec1')
  await api.deleteProject('sw1', 'p1')
  await api.deleteSoftware('st1', 'sw1')
  await api.deleteAdminStudio('st1')
}
