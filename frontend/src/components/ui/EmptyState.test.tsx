import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState title="Nothing here" description="Add an item to get started." />,
    )
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /nothing here/i })).toBeInTheDocument()
    expect(screen.getByText(/add an item/i)).toBeInTheDocument()
  })
})
