import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  CONTEXT_TRUNCATION_BANNER_COPY,
  ContextTruncationBanner,
} from './ContextTruncationBanner'

describe('ContextTruncationBanner', () => {
  it('renders FR copy when visible', () => {
    render(<ContextTruncationBanner visible />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(CONTEXT_TRUNCATION_BANNER_COPY)
  })

  it('hides when not visible', () => {
    render(<ContextTruncationBanner visible={false} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('calls onDismiss when Dismiss is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<ContextTruncationBanner visible onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
