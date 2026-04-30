import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ContextTruncationBanner } from './ContextTruncationBanner'

describe('ContextTruncationBanner', () => {
  it('renders warning when visible', () => {
    render(<ContextTruncationBanner visible />)
    expect(screen.getByTestId('context-truncation-banner')).toBeInTheDocument()
    expect(
      screen.getByText(/This section is very large/i),
    ).toBeInTheDocument()
  })

  it('renders nothing when not visible', () => {
    const { container } = render(<ContextTruncationBanner visible={false} />)
    expect(container.firstChild).toBeNull()
  })
})
