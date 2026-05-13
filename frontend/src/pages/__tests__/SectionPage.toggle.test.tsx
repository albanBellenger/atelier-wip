import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, afterEach } from 'vitest'

import * as api from '../../services/api'
import { SectionPage } from '../SectionPage'

vi.mock('../../hooks/useYjsCollab', async () => {
  const Y = await import('yjs')
  const ydoc = new Y.Doc()
  const ytext = ydoc.getText('codemirror')
  ytext.insert(0, 'hello')
  return {
    colorsForUser: (): { color: string; colorLight: string } => ({
      color: 'hsl(0 70% 60%)',
      colorLight: 'hsl(0 70% 60% / 22%)',
    }),
    useYjsCollab: () => ({
      ydoc,
      ytext,
      provider: { on: vi.fn(), off: vi.fn() },
      awareness: {
        clientID: 0,
        getStates: (): Map<number, unknown> => new Map(),
        on: vi.fn(),
        off: vi.fn(),
      },
    }),
  }
})

vi.mock('../../components/outline-editor-v2/OutlineEditorV2', () => ({
  OutlineEditorV2: () => (
    <div data-testid="outline-editor-v2-root">Outline V2</div>
  ),
}))

const mockSoftware: api.Software = {
  id: 'sw1',
  studio_id: 's1',
  name: 'Billing',
  description: null,
  definition: null,
  git_provider: null,
  git_repo_url: null,
  git_branch: null,
  git_token_set: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockProject: api.Project = {
  id: 'p1',
  software_id: 'sw1',
  name: 'Release 2',
  description: null,
  publish_folder_slug: 'rel2',
  archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  sections: [],
  work_orders_done: 0,
  work_orders_total: 0,
  sections_count: 1,
  last_edited_at: null,
}

function minimalStubApis(): void {
  vi.spyOn(api, 'getLlmRuntimeInfo').mockResolvedValue({
    llm_provider: 'openai',
    llm_model: 'gpt-4o-mini',
  })
  vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
    thread_id: 'th-1',
    messages: [],
  })
  vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
  vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
  vi.spyOn(api, 'getContextPreview').mockResolvedValue({
    blocks: [],
    total_tokens: 0,
    budget_tokens: 8000,
    overflow_strategy_applied: null,
  })
  vi.spyOn(api, 'improveSection').mockResolvedValue({
    improved_markdown: '## X\n',
  })
  vi.spyOn(api, 'listSections').mockResolvedValue([])
  vi.spyOn(api, 'getSectionHealth').mockResolvedValue({
    drift_count: 0,
    gap_count: 0,
    token_used: 0,
    token_budget: 8000,
    citations_resolved: 0,
    citations_missing: 0,
    drawer_drift: null,
    drawer_gap: null,
    drawer_tokens: null,
    drawer_sources: null,
  })
  vi.spyOn(api, 'getSoftware').mockResolvedValue(mockSoftware)
  vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftware])
  vi.spyOn(api, 'listProjects').mockResolvedValue([mockProject])
  vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
  vi.spyOn(api, 'getSection').mockResolvedValue({
    id: 'sec-1',
    project_id: 'p1',
    title: 'API design',
    slug: 'api-design',
    order: 1,
    content: '',
    status: 'ready',
    open_issue_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
}

describe('SectionPage V1/V2 toggle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('renders V1 split workspace when outlineEditorV2 pref is false', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    localStorage.clear()
    localStorage.setItem(
      'atelier:userEditorPrefs',
      JSON.stringify({
        outlineEditorV2: false,
        outlineRailPinned: false,
        outlineRawDefault: false,
      }),
    )
    minimalStubApis()
    const memberMe: api.MeResponse = {
      user: {
        id: 'u1',
        email: 'e@example.com',
        display_name: 'Editor',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    }
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)

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
              element={<SectionPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('outline-editor-v2-root')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('milkdown-host')).toBeInTheDocument()
    })
  })

  it('renders V2 root when outlineEditorV2 pref is true', async () => {
    localStorage.clear()
    localStorage.setItem(
      'atelier:userEditorPrefs',
      JSON.stringify({
        outlineEditorV2: true,
        outlineRailPinned: false,
        outlineRawDefault: false,
      }),
    )
    minimalStubApis()
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'e@example.com',
        display_name: 'Editor',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })

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
              element={<SectionPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('outline-editor-v2-root')).toBeInTheDocument()
  })

  it('rerenders when pref flips', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    localStorage.clear()
    localStorage.setItem(
      'atelier:userEditorPrefs',
      JSON.stringify({
        outlineEditorV2: false,
        outlineRailPinned: false,
        outlineRawDefault: false,
      }),
    )
    minimalStubApis()
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'e@example.com',
        display_name: 'Editor',
        is_platform_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' },
      ],
      cross_studio_grants: [],
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <MemoryRouter
        initialEntries={[
          '/studios/s1/software/sw1/projects/p1/sections/sec-1',
        ]}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId/sections/:sectionId"
              element={<SectionPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('milkdown-host')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('outline-editor-v2-root')).not.toBeInTheDocument()

    view.unmount()

    localStorage.setItem(
      'atelier:userEditorPrefs',
      JSON.stringify({
        outlineEditorV2: true,
        outlineRailPinned: false,
        outlineRawDefault: false,
      }),
    )

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
              element={<SectionPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('outline-editor-v2-root')).toBeInTheDocument()
  })
})
