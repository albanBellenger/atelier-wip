import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { BuilderShortcutsCard } from './BuilderShortcutsCard'

describe('BuilderShortcutsCard', () => {
  it('renders navigation targets when capabilities allow', () => {
    render(
      <MemoryRouter>
        <BuilderShortcutsCard
          studioId="s1"
          softwareId="sw1"
          projectId="p1"
          showAnalysis
          canPublish
          showGenerateWo
          showOpenGraph
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /run analysis/i })).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/projects/p1/issues',
    )
    expect(
      screen.getByRole('link', { name: /publish to git/i }),
    ).toHaveAttribute('href', '/studios/s1/software/sw1/projects/p1?publish=1')
    expect(screen.getByRole('link', { name: /generate wo/i })).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/projects/p1/work-orders?generate=1',
    )
    expect(screen.getByRole('link', { name: /open graph/i })).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/projects/p1?tab=graph',
    )
  })

  it('omits privileged shortcuts for cross-studio viewer (graph only)', () => {
    render(
      <MemoryRouter>
        <BuilderShortcutsCard
          studioId="s1"
          softwareId="sw1"
          projectId="p1"
          showAnalysis={false}
          canPublish={false}
          showGenerateWo={false}
          showOpenGraph
        />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /run analysis/i })).toBeNull()
    expect(screen.getByRole('link', { name: /open graph/i })).toBeInTheDocument()
  })
})
