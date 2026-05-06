import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import { LlmModelSuggestInput } from './LlmModelSuggestInput'
import * as api from '../../services/api'

function Harness(props: {
  litellmProvider?: string | null
  minChars?: number
  prefetch?: boolean
}): ReactElement {
  const [value, setValue] = useState('')
  return (
    <LlmModelSuggestInput
      id="t-model"
      listId="t-model-dl"
      value={value}
      onChange={setValue}
      litellmProvider={props.litellmProvider}
      minChars={props.minChars}
      prefetch={props.prefetch}
    />
  )
}

describe('LlmModelSuggestInput', () => {
  const suggestSpy = vi.fn()

  beforeEach(() => {
    suggestSpy.mockReset()
    vi.spyOn(api, 'getAdminLlmModelSuggestions').mockImplementation((p) => {
      suggestSpy(p)
      return Promise.resolve({
        models: [
          {
            id: 'moonshot/k-custom',
            label: 'moonshot/k-custom (chat)',
            provider: 'moonshot',
            source: 'catalog',
          },
        ],
        warning: null,
      })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches catalog suggestions when value length reaches minChars', async () => {
    const user = userEvent.setup()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <Harness litellmProvider="moonshot" minChars={2} prefetch={false} />
      </QueryClientProvider>,
    )

    const input = screen.getByRole('combobox')
    await user.type(input, 'kc')

    await waitFor(() => {
      expect(suggestSpy).toHaveBeenCalled()
    })
    const last = suggestSpy.mock.calls[suggestSpy.mock.calls.length - 1]?.[0] as {
      q?: string | null
      litellm_provider?: string | null
    }
    expect(last.litellm_provider).toBe('moonshot')
    expect(String(last.q ?? '')).toContain('kc')
  })

  it('allows free-text values not in the catalog (creatable)', async () => {
    const user = userEvent.setup()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <Harness minChars={0} prefetch />
      </QueryClientProvider>,
    )

    const input = screen.getByRole('combobox')
    await user.type(input, 'my-private-model')
    expect(input).toHaveValue('my-private-model')
  })
})
