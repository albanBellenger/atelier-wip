import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { ReactElement } from 'react'
import { describe, expect, it, afterAll, beforeAll, vi } from 'vitest'

import { useStudioChatModelPicker } from '../../hooks/useStudioChatModelPicker'
import { mswServer } from '../../test-setup'
import { StudioChatModelPicker } from './StudioChatModelPicker'

const STUDIO_ID = 'st-pick'

function PickerHarness(): ReactElement {
  const { modelsQ, options, selectedModel, setSelectedModel, modelTitle } =
    useStudioChatModelPicker({ studioId: STUDIO_ID })
  return (
    <StudioChatModelPicker
      variant="composer"
      modelsQ={modelsQ}
      options={options}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      modelTitle={modelTitle}
      ariaLabel="Test model picker"
    />
  )
}

describe('StudioChatModelPicker', () => {
  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('updates selection via hook when user picks another allowed model', async () => {
    mswServer.use(
      http.get(`http://api.test/studios/${STUDIO_ID}/llm-chat-models`, () =>
        HttpResponse.json({
          effective_model: 'a',
          workspace_default_model: 'a',
          allowed_models: ['a', 'b'],
        }),
      ),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={qc}>
        <PickerHarness />
      </QueryClientProvider>,
    )
    const sel = await screen.findByLabelText('Test model picker')
    expect(sel).toHaveValue('a')
    await user.selectOptions(sel, 'b')
    expect(sel).toHaveValue('b')
  })
})
