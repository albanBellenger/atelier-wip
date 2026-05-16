import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { BackpropSectionFromCodebaseModal } from './BackpropSectionFromCodebaseModal'

function wrap(ui: ReactElement): ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('BackpropSectionFromCodebaseModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not offer generate when codebase is not indexed', async () => {
    render(
      wrap(
        <BackpropSectionFromCodebaseModal
          softwareId="sw"
          sectionId="sec"
          currentMarkdown=""
          hasIndexedCodebase={false}
          isOpen
          onDismiss={() => undefined}
          onInsert={() => undefined}
        />,
      ),
    )
    expect(screen.queryByRole('button', { name: /generate draft/i })).toBeNull()
    expect(screen.getByText(/index the codebase first/i)).toBeTruthy()
  })

  it('dismiss does not call onInsert', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    vi.spyOn(api, 'proposeSoftwareDocSectionDraft').mockResolvedValue({
      markdown: '## X',
      source_files: [],
    })
    render(
      wrap(
        <BackpropSectionFromCodebaseModal
          softwareId="sw"
          sectionId="sec"
          currentMarkdown="old"
          hasIndexedCodebase
          isOpen
          onDismiss={() => undefined}
          onInsert={onInsert}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    await screen.findByText('X')
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('awaits async onInsert before dismiss cleanup runs', async () => {
    const user = userEvent.setup()
    let insertResolved = false
    const onInsert = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            insertResolved = true
            resolve()
          }, 40)
        }),
    )
    const onDismiss = vi.fn()
    vi.spyOn(api, 'proposeSoftwareDocSectionDraft').mockResolvedValue({
      markdown: '## Hello',
      source_files: [],
    })
    render(
      wrap(
        <BackpropSectionFromCodebaseModal
          softwareId="sw"
          sectionId="sec"
          currentMarkdown="old"
          hasIndexedCodebase
          isOpen
          onDismiss={onDismiss}
          onInsert={onInsert}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    expect(await screen.findByText('Hello')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /insert into editor/i }))
    expect(onInsert).toHaveBeenCalledWith('## Hello')
    expect(onDismiss).not.toHaveBeenCalled()
    await waitFor(() => expect(insertResolved).toBe(true), { timeout: 2_000 })
    await waitFor(() => expect(onDismiss).toHaveBeenCalled(), { timeout: 2_000 })
  })

  it('requests draft and calls onInsert', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn()
    vi.spyOn(api, 'proposeSoftwareDocSectionDraft').mockResolvedValue({
      markdown: '## Hello',
      source_files: ['a.py'],
    })
    render(
      wrap(
        <BackpropSectionFromCodebaseModal
          softwareId="sw"
          sectionId="sec"
          currentMarkdown="old"
          hasIndexedCodebase
          isOpen
          onDismiss={() => undefined}
          onInsert={onInsert}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { name: /generate draft/i }))
    expect(await screen.findByText('Hello')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /insert into editor/i }))
    expect(onInsert).toHaveBeenCalledWith('## Hello')
  })
})
