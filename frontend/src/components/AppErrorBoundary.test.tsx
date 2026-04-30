import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenAfterClick(): ReactElement {
  const [broken, setBroken] = useState(false)
  if (broken) {
    throw new Error('child boom')
  }
  return (
    <button type="button" onClick={() => setBroken(true)}>
      Break UI
    </button>
  )
}

describe('AppErrorBoundary', () => {
  it('renders fallback after child throws', async () => {
    const user = userEvent.setup()
    render(
      <AppErrorBoundary>
        <BrokenAfterClick />
      </AppErrorBoundary>,
    )
    await user.click(screen.getByRole('button', { name: /break ui/i }))
    expect(
      await screen.findByRole('heading', { name: /something went wrong/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
  })

  it('fallback has no privileged admin actions', async () => {
    const user = userEvent.setup()
    render(
      <AppErrorBoundary>
        <BrokenAfterClick />
      </AppErrorBoundary>,
    )
    await user.click(screen.getByRole('button', { name: /break ui/i }))
    expect(await screen.findByText(/unexpected error/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete studio/i })).toBeNull()
  })
})
