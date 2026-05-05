import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'

import * as api from '../../services/api'
import { ArtifactQuickUpload } from './ArtifactQuickUpload'

function renderWithClient(ui: ReactElement): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('ArtifactQuickUpload', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when canUpload is false', () => {
    renderWithClient(
      <ArtifactQuickUpload
        softwareId="sw1"
        projectId="p1"
        canUpload={false}
        variant="full"
      />,
    )
    expect(
      screen.queryByRole('button', { name: /^upload file$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows file upload and markdown controls when canUpload is true (full)', () => {
    renderWithClient(
      <ArtifactQuickUpload
        softwareId="sw1"
        projectId="p1"
        canUpload
        variant="full"
      />,
    )
    expect(
      screen.getByRole('button', { name: /^upload file$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^new markdown$/i }),
    ).toBeInTheDocument()
  })

  it('shows only upload file in header variant', () => {
    renderWithClient(
      <ArtifactQuickUpload
        softwareId="sw1"
        projectId="p1"
        canUpload
        variant="header"
      />,
    )
    expect(
      screen.getByRole('button', { name: /^upload file$/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^new markdown$/i }),
    ).not.toBeInTheDocument()
  })

  it('submits markdown via createMarkdownArtifact and clears form', async () => {
    const user = userEvent.setup()
    const mdSpy = vi.spyOn(api, 'createMarkdownArtifact').mockResolvedValue({
      id: 'a1',
      project_id: 'p1',
      name: 'notes.md',
      file_type: 'md',
      size_bytes: 10,
      uploaded_by: null,
      created_at: '',
    })

    renderWithClient(
      <ArtifactQuickUpload
        softwareId="sw1"
        projectId="p1"
        canUpload
        variant="full"
      />,
    )

    await user.click(screen.getByRole('button', { name: /^new markdown$/i }))
    await user.type(screen.getByLabelText(/markdown name/i), 'notes.md')
    await user.type(screen.getByLabelText(/markdown body/i), '# Hello')
    await user.click(screen.getByRole('button', { name: /^save markdown$/i }))

    await vi.waitFor(() => {
      expect(mdSpy).toHaveBeenCalledWith('p1', {
        name: 'notes.md',
        content: '# Hello',
      })
    })
  })

  it('submits markdown via createSoftwareMarkdownArtifact when uploadTarget is software', async () => {
    const user = userEvent.setup()
    const projectMdSpy = vi.spyOn(api, 'createMarkdownArtifact')
    const mdSpy = vi
      .spyOn(api, 'createSoftwareMarkdownArtifact')
      .mockResolvedValue({
        id: 'a1',
        project_id: null,
        name: 'notes.md',
        file_type: 'md',
        size_bytes: 10,
        uploaded_by: null,
        created_at: '',
        scope_level: 'software',
      })

    renderWithClient(
      <ArtifactQuickUpload
        softwareId="sw1"
        projectId="p1"
        uploadTarget="software"
        canUpload
        variant="full"
      />,
    )

    await user.click(screen.getByRole('button', { name: /^new markdown$/i }))
    await user.type(screen.getByLabelText(/markdown name/i), 'notes.md')
    await user.type(screen.getByLabelText(/markdown body/i), '# Hello')
    await user.click(screen.getByRole('button', { name: /^save markdown$/i }))

    await vi.waitFor(() => {
      expect(mdSpy).toHaveBeenCalledWith('sw1', {
        name: 'notes.md',
        content: '# Hello',
      })
    })
    expect(projectMdSpy).not.toHaveBeenCalled()
  })

  it('uploads file via uploadSoftwareArtifact when uploadTarget is software', async () => {
    const user = userEvent.setup()
    const upSpy = vi.spyOn(api, 'uploadSoftwareArtifact').mockResolvedValue({
      id: 'a2',
      project_id: null,
      name: 'doc.pdf',
      file_type: 'pdf',
      size_bytes: 4,
      uploaded_by: null,
      created_at: '',
      scope_level: 'software',
    })
    const projectUpSpy = vi.spyOn(api, 'uploadArtifact')

    const { container } = render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <ArtifactQuickUpload
          softwareId="sw1"
          projectId="p1"
          uploadTarget="software"
          canUpload
          variant="full"
        />
      </QueryClientProvider>,
    )

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    await user.upload(input, file)

    await vi.waitFor(() => {
      expect(upSpy).toHaveBeenCalledWith('sw1', file)
    })
    expect(projectUpSpy).not.toHaveBeenCalled()
  })
})
