import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { mutationCache } from './queryClient'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

function FailMutation(): ReactElement {
  const m = useMutation({
    mutationFn: async () => {
      await Promise.resolve()
      throw { code: 'NOT_FOUND', detail: 'Resource gone' }
    },
  })
  return (
    <button type="button" onClick={() => m.mutate()}>
      Run
    </button>
  )
}

describe('mutation global toast', () => {
  it('shows toast when a mutation fails without skipGlobalToast', async () => {
    const { toast } = await import('sonner')
    const qc = new QueryClient({
      mutationCache,
      defaultOptions: { mutations: { retry: false } },
    })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={qc}>
        <FailMutation />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: /run/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })
})
