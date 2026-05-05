import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Section } from '../../../services/api'
import { OutlineRail } from '../chrome/OutlineRail'

const baseSection: Section = {
  id: 'sec-1',
  project_id: 'p1',
  title: 'One',
  slug: 'one',
  order: 1,
  content: '',
  status: 'ready',
  open_issue_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

vi.mock('../../section/SectionRail', () => ({
  SectionRail: () => <div data-testid="section-rail-mock" />,
}))

describe('OutlineRail', () => {
  it('exposes v2 test id and forwards to SectionRail', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <OutlineRail
            studioId="st"
            softwareId="sw"
            projectId="p1"
            sections={[baseSection]}
            activeSectionId="sec-1"
            collapsed={false}
            onToggleCollapsed={() => {}}
            pinned={false}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('outline-rail-v2')).toBeInTheDocument()
    expect(screen.getByTestId('section-rail-mock')).toBeInTheDocument()
  })
})
