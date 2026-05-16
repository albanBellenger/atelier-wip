import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, afterEach } from 'vitest'

import * as api from '../../../services/api'

vi.mock('../../../hooks/useStudioAccess', () => ({
  useStudioAccess: () => ({
    role: 'studio_member',
    isMember: true,
    isStudioAdmin: false,
    isStudioEditor: true,
    isStudioViewer: false,
    isPlatformAdmin: false,
    isCrossStudioViewer: false,
    canPublish: true,
    canManageProjectOutline: true,
    canEditSoftwareDefinition: true,
    canCreateProject: true,
    crossGrant: null,
    isLoadingCapabilities: false,
    capabilitiesError: false,
  }),
}))

vi.mock('../../editor/CrepeEditor', async () => {
  const React = await import('react')
  const { forwardRef, useImperativeHandle } = React
  return {
    CrepeEditor: forwardRef(function MockCrepe(
      props: { defaultMarkdown?: string },
      ref: React.ForwardedRef<unknown>,
    ) {
      useImperativeHandle(
        ref,
        () => ({
          getEditorView: () => null,
          getMarkdown: () => props.defaultMarkdown ?? '',
          replaceFullMarkdown: async () => undefined,
          applyPatch: () => ({ ok: false as const, reason: 'mock' }),
          animateAppendFromMarkdown: () => Promise.resolve(),
        }),
        [props.defaultMarkdown],
      )
      return (
        <div data-testid="crepe-editor-mock">{props.defaultMarkdown ?? ''}</div>
      )
    }),
  }
})

vi.mock('../../../hooks/useYjsCollab', async () => {
  const Y = await import('yjs')
  const ydoc = new Y.Doc()
  return {
    colorsForUser: (): { color: string; colorLight: string } => ({
      color: 'hsl(0 70% 60%)',
      colorLight: 'hsl(0 70% 60% / 22%)',
    }),
    useYjsCollab: () => ({
      ydoc,
      provider: { on: vi.fn(), off: vi.fn() },
      awareness: {
        clientID: 0,
        getStates: (): Map<number, unknown> => new Map(),
        on: vi.fn(),
        off: vi.fn(),
      },
      sendMarkdownSnapshot: vi.fn(),
    }),
  }
})

const mockSection: api.Section = {
  id: 'sec-1',
  project_id: 'p1',
  software_id: null,
  title: 'API',
  slug: 'api',
  order: 1,
  content: '## Sync\n\nLine.',
  status: 'ready',
  open_issue_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const memberMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'e@example.com',
    display_name: 'Editor',
    is_platform_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'Studio', role: 'studio_member' }],
  cross_studio_grants: [],
}

function stubApis(): void {
  vi.spyOn(api, 'getLlmRuntimeInfo').mockResolvedValue({
    llm_provider: 'openai',
    llm_model: 'gpt-4o-mini',
  })
  vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
    thread_id: 'th-1',
    messages: [],
  })
  vi.spyOn(api, 'getContextPreview').mockResolvedValue({
    blocks: [],
    total_tokens: 0,
    budget_tokens: 8000,
    overflow_strategy_applied: null,
  })
  vi.spyOn(api, 'improveSection').mockResolvedValue({
    improved_markdown: '## X\n',
  })
  vi.spyOn(api, 'me').mockResolvedValue(memberMe)
  vi.spyOn(api, 'getSection').mockResolvedValue(mockSection)
  vi.spyOn(api, 'listSections').mockResolvedValue([])
  vi.spyOn(api, 'getSectionHealth').mockResolvedValue({
    drift_count: 0,
    gap_count: 0,
    token_used: 1,
    token_budget: 2,
    citations_resolved: 0,
    citations_missing: 0,
    drawer_drift: null,
    drawer_gap: null,
    drawer_tokens: null,
    drawer_sources: null,
  })
  vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
  vi.spyOn(api, 'getSoftware').mockResolvedValue({
    id: 'sw1',
    studio_id: 's1',
    name: 'SW',
    description: null,
    definition: null,
    git_provider: null,
    git_repo_url: null,
    git_branch: null,
    git_token_set: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  vi.spyOn(api, 'listSoftware').mockResolvedValue([])
  vi.spyOn(api, 'listProjects').mockResolvedValue([])
  vi.spyOn(api, 'getProject').mockResolvedValue({
    id: 'p1',
    software_id: 'sw1',
    name: 'Proj',
    description: null,
    publish_folder_slug: 'p',
    archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sections: [],
    work_orders_done: 0,
    work_orders_total: 0,
    sections_count: 1,
    last_edited_at: null,
  })
}

describe('yjs-render integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows default markdown in Crepe canvas when collab is ready', async () => {
    const { OutlineEditorV2 } = await import('../OutlineEditorV2')
    localStorage.clear()
    stubApis()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter
        initialEntries={[
          '/studios/s1/software/sw1/projects/p1/sections/sec-1',
        ]}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId/sections/:sectionId"
              element={<OutlineEditorV2 />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(
      () => {
        expect(screen.getByTestId('crepe-editor-mock')).toHaveTextContent(/Sync/)
      },
      { timeout: 5000 },
    )
  })
})
