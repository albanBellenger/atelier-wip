import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { ArtifactsPage } from './ArtifactsPage'

afterEach(() => {
  vi.restoreAllMocks()
})

const editorMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'e@b.com',
    display_name: 'Editor',
    is_tool_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
  cross_studio_grants: [],
}

const viewerMe: api.MeResponse = {
  user: {
    id: 'u2',
    email: 'v@b.com',
    display_name: 'Viewer',
    is_tool_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_viewer' }],
  cross_studio_grants: [],
}

const pendingRow: api.ArtifactItem = {
  id: 'a-pending',
  project_id: 'p1',
  name: 'Wait.pdf',
  file_type: 'pdf',
  size_bytes: 900,
  uploaded_by: 'u1',
  created_at: '2026-01-02T00:00:00Z',
  embedding_status: 'pending',
  embedded_at: null,
  chunk_count: null,
  extracted_char_count: null,
}

const embeddedRow: api.ArtifactItem = {
  id: 'a-ok',
  project_id: 'p1',
  name: 'Ready.md',
  file_type: 'md',
  size_bytes: 80,
  uploaded_by: 'u1',
  created_at: '2026-01-03T00:00:00Z',
  embedding_status: 'embedded',
  embedded_at: '2026-01-03T01:00:00Z',
  chunk_count: 2,
  extracted_char_count: 50,
}

const detail: api.ArtifactDetail = {
  id: 'a-ok',
  project_id: 'p1',
  scope_level: 'project',
  name: 'Ready.md',
  file_type: 'md',
  size_bytes: 80,
  uploaded_by: 'u1',
  created_at: '2026-01-03T00:00:00Z',
  embedding_status: 'embedded',
  embedded_at: '2026-01-03T01:00:00Z',
  chunk_count: 2,
  extracted_char_count: 50,
  embedding_error: null,
  chunk_previews: [{ chunk_index: 0, content: 'hello', content_length: 5 }],
}

function renderArtifacts(path = '/studios/s1/software/sw1/projects/p1/artifacts') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId/projects/:projectId/artifacts"
            element={<ArtifactsPage />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return qc
}

describe('ArtifactsPage', () => {
  it('shows Indexing and Indexed badges for mixed embedding status rows', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(editorMe)
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([pendingRow, embeddedRow])

    renderArtifacts()

    await waitFor(() => {
      expect(screen.getByText('Wait.pdf')).toBeInTheDocument()
    })
    expect(screen.getByText('Indexing…')).toBeInTheDocument()
    expect(screen.getByText('Indexed')).toBeInTheDocument()
  })

  it('opens drawer with chunk previews for a studio member editor', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'me').mockResolvedValue(editorMe)
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([embeddedRow])
    vi.spyOn(api, 'getArtifactDetail').mockResolvedValue(detail)

    renderArtifacts()

    await screen.findByText('Ready.md')
    const rowBtn = screen.getByText('Ready.md').closest('div[role="button"]')
    expect(rowBtn).toBeTruthy()
    await user.click(rowBtn as HTMLElement)

    await waitFor(() => {
      expect(api.getArtifactDetail).toHaveBeenCalledWith('p1', 'a-ok')
    })
    await screen.findByText('First chunks')
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('studio viewer sees status badges but not upload controls', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(viewerMe)
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([embeddedRow, pendingRow])

    renderArtifacts()

    await waitFor(() => {
      expect(screen.getByText('Indexed')).toBeInTheDocument()
    })
    expect(screen.getByText('Indexing…')).toBeInTheDocument()
    expect(
      screen.getByText(/view only — uploads require editor access\./i),
    ).toBeInTheDocument()
  })

  it('studio viewer drawer hides chunk preview section', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'me').mockResolvedValue(viewerMe)
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([embeddedRow])
    vi.spyOn(api, 'getArtifactDetail').mockResolvedValue(detail)

    renderArtifacts()

    await screen.findByText('Ready.md')
    const rowBtn = screen.getByText('Ready.md').closest('div[role="button"]')
    expect(rowBtn).toBeTruthy()
    await user.click(rowBtn as HTMLElement)

    await waitFor(() => {
      expect(api.getArtifactDetail).toHaveBeenCalled()
    })
    await screen.findByText('Artifact details')
    expect(screen.queryByText('First chunks')).not.toBeInTheDocument()
  })
})
