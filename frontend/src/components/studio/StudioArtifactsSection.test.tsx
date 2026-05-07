import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { StudioArtifactsSection } from './StudioArtifactsSection'

function wrap(ui: ReactElement): ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('StudioArtifactsSection', () => {
  const base = {
    studioId: 's1',
    defaultSoftwareId: 'sw1',
    defaultProjectId: 'p1',
    isMember: true,
    isPending: false,
    isError: false,
    rows: [],
    onDownload: vi.fn(),
  }

  it('shows Open library and upload for Owners and Builders', () => {
    render(
      wrap(
        <StudioArtifactsSection {...base} canStudioEditor />,
      ),
    )
    expect(
      screen.getByRole('link', { name: /open library/i }),
    ).toHaveAttribute('href', '/studios/s1/artifact-library')
    expect(
      screen.getByRole('button', { name: /^upload file$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^new markdown$/i }),
    ).toBeInTheDocument()
  })

  it('shows Open library but no upload for viewers', () => {
    render(
      wrap(
        <StudioArtifactsSection {...base} canStudioEditor={false} />,
      ),
    )
    expect(
      screen.getByRole('link', { name: /open library/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^upload file$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows hint when editor but no project to target', () => {
    render(
      wrap(
        <StudioArtifactsSection
          {...base}
          defaultSoftwareId={null}
          defaultProjectId={null}
          canStudioEditor
        />,
      ),
    )
    expect(
      screen.getByRole('link', { name: /open library/i }),
    ).toHaveAttribute('href', '/studios/s1/artifact-library')
    expect(
      screen.getByText(/add a project under any software/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^upload file$/i }),
    ).not.toBeInTheDocument()
  })
})
