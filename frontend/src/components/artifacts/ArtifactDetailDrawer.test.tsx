import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { ArtifactDetailDrawer } from './ArtifactDetailDrawer'

afterEach(() => {
  vi.restoreAllMocks()
})

const baseDetail: api.ArtifactDetail = {
  id: 'a1',
  project_id: 'p1',
  scope_level: 'project',
  name: 'Notes.md',
  file_type: 'md',
  size_bytes: 120,
  uploaded_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
  embedding_status: 'embedded',
  embedded_at: '2026-01-01T01:00:00Z',
  chunk_count: 2,
  extracted_char_count: 400,
  embedding_error: null,
  chunk_previews: [
    { chunk_index: 0, content: 'alpha', content_length: 5 },
    { chunk_index: 1, content: 'beta', content_length: 4 },
  ],
}

function renderDrawer(props: {
  canSeeChunkPreviews: boolean
  projectId: string | null
  detail?: api.ArtifactDetail
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const detail = props.detail ?? baseDetail
  vi.spyOn(api, 'getArtifactDetail').mockImplementation(async () => detail)
  vi.spyOn(api, 'getArtifactDetailById').mockImplementation(async () => detail)

  render(
    <QueryClientProvider client={qc}>
      <ArtifactDetailDrawer
        isOpen
        onClose={() => {}}
        projectId={props.projectId}
        artifactId="a1"
        canSeeChunkPreviews={props.canSeeChunkPreviews}
      />
    </QueryClientProvider>,
  )
  return qc
}

describe('ArtifactDetailDrawer', () => {
  it('shows status block and first chunks for editors', async () => {
    renderDrawer({ canSeeChunkPreviews: true, projectId: 'p1' })

    await waitFor(() => {
      expect(screen.getByText('Notes.md')).toBeInTheDocument()
    })
    expect(screen.getByText('Indexed')).toBeInTheDocument()
    expect(screen.getByText('First chunks')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(api.getArtifactDetail).toHaveBeenCalledWith('p1', 'a1')
  })

  it('shows embedding_error in a pre when failed', async () => {
    renderDrawer({
      canSeeChunkPreviews: true,
      projectId: 'p1',
      detail: {
        ...baseDetail,
        embedding_status: 'failed',
        embedding_error: 'boom',
        chunk_previews: [],
      },
    })
    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument()
    })
  })

  it('does not mount First chunks section for viewers (chunk previews omitted)', async () => {
    renderDrawer({ canSeeChunkPreviews: false, projectId: 'p1' })

    await waitFor(() => {
      expect(screen.getByText('Notes.md')).toBeInTheDocument()
    })
    expect(screen.queryByText('First chunks')).not.toBeInTheDocument()
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
  })

  it('loads by artifact id when project id is null', async () => {
    renderDrawer({ canSeeChunkPreviews: true, projectId: null })

    await waitFor(() => {
      expect(screen.getByText('Notes.md')).toBeInTheDocument()
    })
    expect(api.getArtifactDetailById).toHaveBeenCalledWith('a1')
    expect(api.getArtifactDetail).not.toHaveBeenCalled()
  })

  it('closes when backdrop is activated', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.spyOn(api, 'getArtifactDetail').mockResolvedValue(baseDetail)

    render(
      <QueryClientProvider client={qc}>
        <ArtifactDetailDrawer
          isOpen
          onClose={onClose}
          projectId="p1"
          artifactId="a1"
          canSeeChunkPreviews
        />
      </QueryClientProvider>,
    )

    await screen.findByText('Notes.md')
    await user.click(screen.getByRole('button', { name: /close drawer/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
