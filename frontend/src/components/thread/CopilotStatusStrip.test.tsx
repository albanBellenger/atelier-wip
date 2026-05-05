import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CopilotStatusStrip } from './CopilotStatusStrip'

describe('CopilotStatusStrip', () => {
  it('shows counts from props and switches tab on click', async () => {
    const user = userEvent.setup()
    const onTab = vi.fn()
    render(
      <CopilotStatusStrip
        driftCount={2}
        gapCount={1}
        tokenUsed={1500}
        tokenBudget={8000}
        sourcesCount={4}
        onSelectTab={onTab}
      />,
    )
    expect(screen.getByTestId('copilot-status-strip')).toHaveTextContent(
      '2 drift',
    )
    expect(screen.getByTestId('copilot-status-strip')).toHaveTextContent(
      '1 gap',
    )
    await user.click(screen.getByRole('button', { name: /2 drift/ }))
    expect(onTab).toHaveBeenCalledWith('critique')
    await user.click(screen.getByRole('button', { name: /1 gap/ }))
    expect(onTab).toHaveBeenLastCalledWith('critique')
    await user.click(screen.getByRole('button', { name: /2k\/8k tok/ }))
    expect(onTab).toHaveBeenCalledWith('context')
  })
})
