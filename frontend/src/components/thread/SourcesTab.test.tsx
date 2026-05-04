import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { SourcesTab } from './SourcesTab'

const emptyPrefs: api.SectionContextPreferences = {
  excluded_kinds: [],
  pinned_artifact_ids: [],
  pinned_section_ids: [],
  pinned_work_order_ids: [],
  extra_urls: [],
}

function renderSources(
  props: { projectId: string; sectionId: string; canEditContext?: boolean },
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SourcesTab {...props} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('SourcesTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads citation and list sections', async () => {
    vi.spyOn(api, 'getCitationHealth').mockResolvedValue({
      citations_resolved: 1,
      citations_missing: 0,
      missing_items: [],
    })
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
    vi.spyOn(api, 'listSections').mockResolvedValue([
      {
        id: 'sec-a',
        project_id: 'p1',
        title: 'Intro',
        slug: 'intro',
        order: 0,
        content: '',
        status: 'ready',
        open_issue_count: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    vi.spyOn(api, 'getSectionContextPreferences').mockResolvedValue(emptyPrefs)

    renderSources({
      projectId: 'p1',
      sectionId: 'sec-a',
      canEditContext: true,
    })

    await waitFor(() => {
      expect(screen.getByTestId('sources-tab')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Intro')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(
        screen.getByText('No missing citations flagged.'),
      ).toBeInTheDocument()
    })
  })

  it('editor adds pinned URL via PATCH prefs', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'getCitationHealth').mockResolvedValue({
      citations_resolved: 0,
      citations_missing: 0,
      missing_items: [],
    })
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([])
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
    vi.spyOn(api, 'listSections').mockResolvedValue([])
    vi.spyOn(api, 'getSectionContextPreferences').mockResolvedValue(emptyPrefs)
    const patchSpy = vi
      .spyOn(api, 'patchSectionContextPreferences')
      .mockResolvedValue({
        ...emptyPrefs,
        extra_urls: [{ url: 'https://example.com/doc', note: 'ref' }],
      })

    renderSources({
      projectId: 'p1',
      sectionId: 'sec-1',
      canEditContext: true,
    })

    await waitFor(() => {
      expect(screen.getByTestId('sources-extra-url-form')).toBeInTheDocument()
    })
    await user.type(
      screen.getByPlaceholderText(/https/i),
      'https://example.com/doc',
    )
    await user.type(screen.getByPlaceholderText(/Why this link matters/), 'ref')
    await user.click(screen.getByRole('button', { name: 'Add to context' }))

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('p1', 'sec-1', {
        extra_urls: [{ url: 'https://example.com/doc', note: 'ref' }],
      })
    })
  })

  it('viewer does not get URL form or pin controls', async () => {
    vi.spyOn(api, 'getCitationHealth').mockResolvedValue({
      citations_resolved: 0,
      citations_missing: 0,
      missing_items: [],
    })
    vi.spyOn(api, 'listArtifacts').mockResolvedValue([
      {
        id: 'art-1',
        project_id: 'p1',
        name: 'Spec.pdf',
        file_type: 'pdf',
        size_bytes: 100,
        uploaded_by: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ])
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
    vi.spyOn(api, 'listSections').mockResolvedValue([])
    vi.spyOn(api, 'getSectionContextPreferences').mockResolvedValue(emptyPrefs)

    renderSources({
      projectId: 'p1',
      sectionId: 'sec-1',
      canEditContext: false,
    })

    await waitFor(() => {
      expect(screen.getByText('Spec.pdf')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('sources-extra-url-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
  })
})
