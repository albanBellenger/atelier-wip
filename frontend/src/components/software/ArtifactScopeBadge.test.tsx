import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ArtifactScopeBadge } from './ArtifactScopeBadge'

describe('ArtifactScopeBadge', () => {
  it('renders studio software and project labels', () => {
    const { rerender } = render(<ArtifactScopeBadge level="studio" />)
    expect(screen.getByText('Studio')).toBeInTheDocument()
    rerender(<ArtifactScopeBadge level="software" />)
    expect(screen.getByText('Software')).toBeInTheDocument()
    rerender(<ArtifactScopeBadge level="project" />)
    expect(screen.getByText('Project')).toBeInTheDocument()
  })
})
