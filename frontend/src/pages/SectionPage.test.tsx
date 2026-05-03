import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { APP_VERSION } from '../version'
import { SectionPage } from './SectionPage'

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
    is_tool_admin: false,
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
})
