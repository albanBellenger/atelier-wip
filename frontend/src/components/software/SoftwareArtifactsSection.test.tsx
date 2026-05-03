import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { SoftwareArtifactsSection } from './SoftwareArtifactsSection'

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

describe('SoftwareArtifactsSection', () => {
  const baseProps = {
    studioId: 's1',
    softwareId: 'sw1',
    defaultProjectId: 'p1',
    isMember: true,
    isPending: false,
    isError: false,
    rows: [],
    onDownload: vi.fn(),
  }

  it('shows Open library and full upload for studio editors', () => {
    render(
      wrap(
        <SoftwareArtifactsSection
          {...baseProps}
          canStudioEditor
        />,
      ),
    )
    expect(
      screen.getByRole('link', { name: /open library/i }),
    ).toHaveAttribute(
      'href',
      '/studios/s1/artifact-library?softwareId=sw1',
    )
    expect(
      screen.getByRole('button', { name: /^upload file$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^new markdown$/i }),
    ).toBeInTheDocument()
  })

  it('shows Open library but no upload controls for viewers', () => {
    render(
      wrap(
        <SoftwareArtifactsSection
          {...baseProps}
          canStudioEditor={false}
        />,
      ),
    )
    expect(
      screen.getByRole('link', { name: /open library/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^upload file$/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^new markdown$/i }),
    ).not.toBeInTheDocument()
  })
})
