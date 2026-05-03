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
  context_studio_id: 'st1',
  context_software_id: 'sf1',
  name: 'Notes.md',
  file_type: 'md',
  size_bytes: 120,
  uploaded_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
  chunking_strategy: null,
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
  canReindexArtifact?: boolean
  canDeleteArtifact?: boolean
  canConfigureChunking?: boolean
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const detail = props.detail ?? baseDetail
  vi.spyOn(api, 'getArtifactDetail').mockImplementation(async () => detail)
  vi.spyOn(api, 'getArtifactDetailById').mockImplementation(async () => detail)
  vi.spyOn(api, 'listArtifactChunkingStrategies').mockResolvedValue({
    strategies: ['fixed_window', 'sentence', 'markdown'],
  })
  vi.spyOn(api, 'listSoftware').mockResolvedValue([
    {
      id: 'sf1',
      studio_id: 'st1',
      name: 'Sw',
      description: null,
      definition: null,
      git_provider: null,
      git_repo_url: null,
      git_branch: 'main',
      git_token_set: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ])
  vi.spyOn(api, 'listStudioProjects').mockResolvedValue([
    {
      id: 'p1',
      software_id: 'sf1',
      name: 'P',
      description: null,
      publish_folder_slug: 'p',
      archived: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      sections: null,
      work_orders_done: 0,
      work_orders_total: 0,
      sections_count: 0,
      last_edited_at: null,
      software_name: 'Sw',
    },
  ])

  render(
    <QueryClientProvider client={qc}>
      <ArtifactDetailDrawer
        isOpen
        onClose={() => {}}
        projectId={props.projectId}
        artifactId="a1"
        canSeeChunkPreviews={props.canSeeChunkPreviews}
        canReindexArtifact={props.canReindexArtifact ?? true}
        canDeleteArtifact={props.canDeleteArtifact ?? false}
        canConfigureChunking={props.canConfigureChunking ?? false}
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

  it('viewer cannot re-index (control absent)', async () => {
    renderDrawer({
      canSeeChunkPreviews: true,
      projectId: 'p1',
      canReindexArtifact: false,
    })
    await waitFor(() => {
      expect(screen.getByText('Notes.md')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /re-index for search/i })).not.toBeInTheDocument()
  })

  it('studio member sees re-index but not delete or chunking controls', async () => {
    renderDrawer({
      canSeeChunkPreviews: true,
      projectId: 'p1',
      canReindexArtifact: true,
      canDeleteArtifact: false,
      canConfigureChunking: false,
    })
    await waitFor(() => {
      expect(screen.getByText('Notes.md')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /re-index for search/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete artifact/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/chunking strategy/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Library scope')).not.toBeInTheDocument()
  })

  it('studio admin sees delete, chunking, and library scope controls', async () => {
    renderDrawer({
      canSeeChunkPreviews: true,
      projectId: 'p1',
      canReindexArtifact: true,
      canDeleteArtifact: true,
      canConfigureChunking: true,
    })
    await waitFor(() => {
      expect(screen.getByText('Notes.md')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /delete artifact/i })).toBeInTheDocument()
    expect(screen.getByText(/chunking strategy/i)).toBeInTheDocument()
    expect(screen.getByText('Library scope')).toBeInTheDocument()
  })

  it('closes when backdrop is activated', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.spyOn(api, 'getArtifactDetail').mockResolvedValue(baseDetail)
    vi.spyOn(api, 'listArtifactChunkingStrategies').mockResolvedValue({
      strategies: ['fixed_window'],
    })

    render(
      <QueryClientProvider client={qc}>
        <ArtifactDetailDrawer
          isOpen
          onClose={onClose}
          projectId="p1"
          artifactId="a1"
          canSeeChunkPreviews
          canReindexArtifact={false}
          canDeleteArtifact={false}
          canConfigureChunking={false}
        />
      </QueryClientProvider>,
    )

    await screen.findByText('Notes.md')
    await user.click(screen.getByRole('button', { name: /close drawer/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
