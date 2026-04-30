import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ListSkeleton } from './ListSkeleton'

describe('ListSkeleton', () => {
  it('renders the requested number of rows', () => {
    render(<ListSkeleton rows={2} />)
    const root = screen.getByTestId('list-skeleton')
    expect(root).toBeInTheDocument()
    expect(root.querySelectorAll('li')).toHaveLength(2)
  })
})
