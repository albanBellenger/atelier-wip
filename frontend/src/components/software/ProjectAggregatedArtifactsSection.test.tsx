import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { SoftwareArtifactRow } from '../../services/api'
import { ProjectAggregatedArtifactsSection } from './ProjectAggregatedArtifactsSection'

const baseRow = (over: Partial<SoftwareArtifactRow>): SoftwareArtifactRow => ({
  id: 'a1',
  project_id: 'p1',
  project_name: 'P1',
  name: 'Doc',
  file_type: 'pdf',
  size_bytes: 100,
  uploaded_by: null,
  uploaded_by_display: null,
  created_at: '2026-01-01T00:00:00Z',
  scope_level: 'project',
  excluded_at_software: null,
  excluded_at_project: null,
  ...over,
})

function renderSection(ui: ReactElement): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProjectAggregatedArtifactsSection', () => {
  it('returns null when not a member', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ProjectAggregatedArtifactsSection
            studioId="s1"
            softwareId="sw1"
            projectId="p1"
            isMember={false}
            canStudioEditor={false}
            isPending={false}
            isError={false}
            rows={[]}
            onDownload={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(
      screen.queryByRole('heading', { name: /^artifacts$/i }),
    ).not.toBeInTheDocument()
  })

  it('lists non-excluded artifacts only', () => {
    renderSection(
      <ProjectAggregatedArtifactsSection
        studioId="s1"
        softwareId="sw1"
        projectId="p1"
        isMember
        canStudioEditor
        isPending={false}
        isError={false}
        rows={[
          baseRow({ id: 'a1', name: 'Visible' }),
          baseRow({
            id: 'a2',
            name: 'Hidden software',
            excluded_at_software: '2026-01-02T00:00:00Z',
          }),
          baseRow({
            id: 'a3',
            name: 'Hidden project',
            excluded_at_project: '2026-01-02T00:00:00Z',
          }),
        ]}
        onDownload={vi.fn()}
      />,
    )
    expect(screen.getByText('Visible')).toBeInTheDocument()
    expect(screen.queryByText('Hidden software')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden project')).not.toBeInTheDocument()
    expect(screen.getByText(/1 file/i)).toBeInTheDocument()
  })

  it('omits upload controls for viewers', () => {
    renderSection(
      <ProjectAggregatedArtifactsSection
        studioId="s1"
        softwareId="sw1"
        projectId="p1"
        isMember
        canStudioEditor={false}
        isPending={false}
        isError={false}
        rows={[baseRow({ name: 'Readme' })]}
        onDownload={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /^upload file$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows upload for Owners and Builders', () => {
    renderSection(
      <ProjectAggregatedArtifactsSection
        studioId="s1"
        softwareId="sw1"
        projectId="p1"
        isMember
        canStudioEditor
        isPending={false}
        isError={false}
        rows={[]}
        onDownload={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: /^upload file$/i }),
    ).toBeInTheDocument()
  })
})
