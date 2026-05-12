import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import * as Y from 'yjs'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as yCollab from '../hooks/useYjsCollab'
import * as api from '../services/api'
import { SoftwareDocEditorPage } from './SoftwareDocEditorPage'

vi.mock('../hooks/useStudioAccess', () => ({
  useStudioAccess: () => ({
    role: 'studio_editor',
    isMember: true,
    isStudioAdmin: false,
    isStudioEditor: true,
    isPlatformAdmin: false,
    isCrossStudioViewer: false,
    canPublish: true,
    canManageProjectOutline: true,
    canEditSoftwareDefinition: true,
    canCreateProject: true,
    isLoadingCapabilities: false,
    capabilitiesError: false,
    crossGrant: null,
  }),
}))

vi.mock('../hooks/useYjsCollab', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useYjsCollab')>()
  return {
    ...actual,
    useSoftwareDocYjsCollab: vi.fn(),
  }
})

const editorMe: api.MeResponse = {
  user: {
    id: 'u-e',
    email: 'e@e.com',
    display_name: 'Ed',
    is_platform_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_editor' }],
  cross_studio_grants: [],
}

function wrap(path: string): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId/docs/:sectionId"
            element={<SoftwareDocEditorPage />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('SoftwareDocEditorPage doc sync apply', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('applies replacement from session and resolves issue after idle match', async () => {
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('codemirror')
    const collab = {
      ydoc,
      ytext,
      provider: { on: vi.fn(), off: vi.fn() },
      awareness: {
        on: vi.fn(),
        off: vi.fn(),
        setLocalStateField: vi.fn(),
      },
    }
    vi.mocked(yCollab.useSoftwareDocYjsCollab).mockReturnValue(
      collab as unknown as yCollab.YjsCollab,
    )

    sessionStorage.setItem(
      'atelier_doc_sync:iss1',
      JSON.stringify({
        projectId: 'p1',
        issueId: 'iss1',
        replacementMarkdown: 'Replaced body',
        softwareId: 'sw1',
        sectionId: 'sec1',
      }),
    )

    const updateSpy = vi.spyOn(api, 'updateIssue').mockResolvedValue({
      id: 'iss1',
      project_id: null,
      software_id: 'sw1',
      work_order_id: null,
      kind: 'doc_update_suggested',
      triggered_by: null,
      section_a_id: 'sec1',
      section_b_id: null,
      description: '',
      status: 'resolved',
      origin: 'auto',
      run_actor_id: null,
      payload_json: null,
      resolution_reason: 'applied',
      created_at: '',
    })

    vi.spyOn(api, 'me').mockResolvedValue(editorMe)
    vi.spyOn(api, 'getSoftwareDocsSection').mockResolvedValue({
      id: 'sec1',
      project_id: null,
      software_id: 'sw1',
      title: 'T',
      slug: 't',
      order: 0,
      content: 'Old',
      status: 'ready',
      open_issue_count: 0,
      outline_health: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listCodebaseSnapshots').mockResolvedValue([])
    vi.spyOn(api, 'getSoftware').mockResolvedValue({
      id: 'sw1',
      studio_id: 's1',
      name: 'SW',
      description: null,
      definition: null,
      git_provider: 'gitlab',
      git_repo_url: null,
      git_branch: 'main',
      git_token_set: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.spyOn(api, 'listSoftware').mockResolvedValue([])

    render(wrap('/studios/s1/software/sw1/docs/sec1?docSyncIssue=iss1'))
    await screen.findByRole('heading', { level: 1, name: 'T' })

    expect(ytext.toString()).toBe('Replaced body')

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('p1', 'iss1', 'resolved', {
        resolution_reason: 'applied',
      })
    })
  })
})
