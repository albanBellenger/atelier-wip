import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { CodebaseSettingsPanel } from './CodebaseSettingsPanel'

function wrap(ui: ReactElement): ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('CodebaseSettingsPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('removes re-index control when user cannot request it', async () => {
    vi.spyOn(api, 'listCodebaseSnapshots').mockResolvedValue([])
    render(wrap(<CodebaseSettingsPanel softwareId="s1" canRequestReindex={false} />))
    expect(screen.queryByRole('button', { name: /re-index codebase/i })).toBeNull()
    expect(await screen.findByText(/no snapshots yet/i)).toBeTruthy()
  })

  it('shows re-index for builders and calls API', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'listCodebaseSnapshots').mockResolvedValue([])
    vi.spyOn(api, 'requestCodebaseReindex').mockResolvedValue({
      id: 'snap-1',
      software_id: 's1',
      commit_sha: 'abc',
      branch: 'main',
      status: 'pending',
      error_message: null,
      created_at: new Date().toISOString(),
      ready_at: null,
      file_count: 0,
      chunk_count: 0,
    })
    render(wrap(<CodebaseSettingsPanel softwareId="s1" canRequestReindex />))
    await user.click(await screen.findByRole('button', { name: /re-index codebase/i }))
    expect(api.requestCodebaseReindex).toHaveBeenCalledWith('s1')
  })
})
