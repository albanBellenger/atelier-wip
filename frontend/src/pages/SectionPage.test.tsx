import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { APP_VERSION } from '../version'
import { SectionPage } from './SectionPage'

vi.mock('../components/editor/SplitEditor', () => ({
  SplitEditor: function MockSplitEditor(): ReactElement {
    return <div data-testid="crepe-host">mock-editor</div>
  },
}))

vi.mock('../hooks/useYjsCollab', async () => {
  const Y = await import('yjs')
  const ydoc = new Y.Doc()
  const bundle = {
    ydoc,
    provider: { on: vi.fn(), off: vi.fn() },
    awareness: {
      clientID: 0,
      getStates: (): Map<number, unknown> => new Map(),
      on: vi.fn(),
      off: vi.fn(),
    },
    sendMarkdownSnapshot: vi.fn(),
  }
  return {
    colorsForUser: (): { color: string; colorLight: string } => ({
      color: 'hsl(0 70% 60%)',
      colorLight: 'hsl(0 70% 60% / 22%)',
    }),
    useYjsCollab: () => bundle,
  }
})

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

const memberMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'e@example.com',
    display_name: 'Editor',
    is_platform_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'Studio One', role: 'studio_member' }],
  cross_studio_grants: [],
}

const viewerMe: api.MeResponse = {
  ...memberMe,
  user: { ...memberMe.user, id: 'u2', display_name: 'Viewer' },
  studios: [{ studio_id: 's1', studio_name: 'Studio One', role: 'studio_viewer' }],
}

function renderSection(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
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
}

describe('SectionPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    localStorage.clear()
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
    vi.spyOn(api, 'listSections').mockResolvedValue([
      {
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
      },
    ])
    vi.spyOn(api, 'getSectionHealth').mockResolvedValue({
      drift_count: 0,
      gap_count: 0,
      token_used: 0,
      token_budget: 6000,
      citations_resolved: 0,
      citations_missing: 0,
      drawer_drift: null,
      drawer_gap: null,
      drawer_tokens: null,
      drawer_sources: null,
    })
    vi.spyOn(api, 'getSectionContextPreferences').mockResolvedValue({
      excluded_kinds: [],
      pinned_artifact_ids: [],
      pinned_section_ids: [],
      pinned_work_order_ids: [],
      extra_urls: [],
    })
    vi.spyOn(api, 'getCitationHealth').mockResolvedValue({
      citations_resolved: 0,
      citations_missing: 0,
      missing_items: [],
    })
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([])
  })

  it('renders builder header and footer when section loads', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)
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
    vi.spyOn(api, 'getSoftware').mockResolvedValue(mockSoftware)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftware])
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    vi.spyOn(api, 'listProjects').mockResolvedValue([mockProject])

    renderSection(
      '/studios/s1/software/sw1/projects/p1/sections/sec-1',
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /API design/ }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Studio One')).toBeInTheDocument()
    expect(screen.getByText('Atelier · Builder workspace')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: new RegExp(`v${APP_VERSION}`) }),
    ).toBeInTheDocument()
  })

  it('viewer does not see Issues shortcut link on section page', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'me').mockResolvedValue(viewerMe)
    vi.spyOn(api, 'getSection').mockResolvedValue({
      id: 'sec-1',
      project_id: 'p1',
      title: 'Readonly sec',
      slug: 'r',
      order: 0,
      content: '',
      status: 'ready',
      open_issue_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'getSoftware').mockResolvedValue(mockSoftware)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftware])
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    vi.spyOn(api, 'listProjects').mockResolvedValue([mockProject])

    renderSection(
      '/studios/s1/software/sw1/projects/p1/sections/sec-1',
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /Readonly sec/ }),
      ).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('link', { name: 'Issues' }),
    ).not.toBeInTheDocument()
  })

  it('defaults to split layout and persists focus mode per section', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)
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
    vi.spyOn(api, 'getSoftware').mockResolvedValue(mockSoftware)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftware])
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    vi.spyOn(api, 'listProjects').mockResolvedValue([mockProject])

    renderSection(
      '/studios/s1/software/sw1/projects/p1/sections/sec-1',
    )

    await waitFor(() => {
      expect(screen.getByTestId('crepe-host')).toBeInTheDocument()
    })
    expect(screen.getByTestId('section-layout-switcher')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Focus/ }))
    await waitFor(() => {
      expect(screen.getByTestId('section-title-breadcrumb')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('crepe-host')).not.toBeInTheDocument()
    expect(localStorage.getItem('atelier:sectionLayout:sec-1')).toBe('focus')
  })

  it('Cmd+K toggles between split and focus', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)
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
    vi.spyOn(api, 'getSoftware').mockResolvedValue(mockSoftware)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftware])
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    vi.spyOn(api, 'listProjects').mockResolvedValue([mockProject])

    renderSection(
      '/studios/s1/software/sw1/projects/p1/sections/sec-1',
    )

    await waitFor(() => {
      expect(screen.getByTestId('crepe-host')).toBeInTheDocument()
    })

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: true,
          bubbles: true,
        }),
      )
    })
    await waitFor(() => {
      expect(screen.getByTestId('section-title-breadcrumb')).toBeInTheDocument()
    })

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: true,
          bubbles: true,
        }),
      )
    })
    await waitFor(() => {
      expect(screen.getByTestId('crepe-host')).toBeInTheDocument()
    })
  })

  it('shows section rail and health rail when section loads', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)
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
    vi.spyOn(api, 'getSoftware').mockResolvedValue(mockSoftware)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftware])
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    vi.spyOn(api, 'listProjects').mockResolvedValue([mockProject])

    renderSection(
      '/studios/s1/software/sw1/projects/p1/sections/sec-1',
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Section outline')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: /Drift/i })[0]).toBeInTheDocument()
  })

  it('viewer does not see context kind preference toggles', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'me').mockResolvedValue(viewerMe)
    vi.spyOn(api, 'getSection').mockResolvedValue({
      id: 'sec-1',
      project_id: 'p1',
      title: 'Readonly sec',
      slug: 'r',
      order: 0,
      content: '',
      status: 'ready',
      open_issue_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'getSoftware').mockResolvedValue(mockSoftware)
    vi.spyOn(api, 'listSoftware').mockResolvedValue([mockSoftware])
    vi.spyOn(api, 'getProject').mockResolvedValue(mockProject)
    vi.spyOn(api, 'listProjects').mockResolvedValue([mockProject])
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [
        {
          label: 'x',
          kind: 'git_history',
          tokens: 1,
          relevance: null,
          truncated: false,
          body: 'body',
        },
      ],
      total_tokens: 1,
      budget_tokens: 8000,
      overflow_strategy_applied: null,
    })

    renderSection(
      '/studios/s1/software/sw1/projects/p1/sections/sec-1',
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /Readonly sec/ }),
      ).toBeInTheDocument()
    })
    await user.click(
      within(screen.getByTestId('section-layout-switcher')).getByRole(
        'tab',
        { name: /Context/ },
      ),
    )
    await waitFor(() => {
      expect(screen.getByTestId('context-tab')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('context-kind-prefs')).not.toBeInTheDocument()
  })
})
