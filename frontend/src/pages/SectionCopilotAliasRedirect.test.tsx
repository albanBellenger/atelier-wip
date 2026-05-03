import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { SectionCopilotAliasRedirect } from './SectionCopilotAliasRedirect'

describe('SectionCopilotAliasRedirect', () => {
  it('redirects /sections/:id/copilot to canonical section URL', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/studios/s1/software/sw1/projects/p1/sections/sec1/copilot',
        ]}
      >
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId/projects/:projectId/sections/:sectionId/copilot"
            element={<SectionCopilotAliasRedirect />}
          />
          <Route
            path="/studios/:studioId/software/:softwareId/projects/:projectId/sections/:sectionId"
            element={<div data-testid="section">ok</div>}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('section')).toBeInTheDocument()
  })
})
