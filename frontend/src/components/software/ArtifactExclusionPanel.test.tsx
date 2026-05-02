import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SoftwareArtifactRow } from '../../services/api'
import { ArtifactExclusionPanel } from './ArtifactExclusionPanel'

const baseRow = (): SoftwareArtifactRow => ({
  id: 'a1',
  project_id: 'p1',
  project_name: 'P1',
  name: 'Doc',
  file_type: 'md',
  size_bytes: 3,
  uploaded_by: 'u1',
  uploaded_by_display: 'U',
  created_at: '2026-01-01T00:00:00Z',
  scope_level: 'project',
  excluded_at_software: null,
  excluded_at_project: null,
})

describe('ArtifactExclusionPanel', () => {
  it('viewer cannot see exclusion switch', () => {
    render(
      <ArtifactExclusionPanel
        title="T"
        description="D"
        rows={[baseRow()]}
        isPending={false}
        isError={false}
        mode="software"
        canEdit={false}
        isSavingId={null}
        onToggleExcluded={() => {}}
      />,
    )
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('editor toggles exclusion', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <ArtifactExclusionPanel
        title="T"
        description="D"
        rows={[baseRow()]}
        isPending={false}
        isError={false}
        mode="software"
        canEdit={true}
        isSavingId={null}
        onToggleExcluded={onToggle}
      />,
    )
    await user.click(
      screen.getByRole('switch', { name: /exclude doc from software context/i }),
    )
    expect(onToggle).toHaveBeenCalledWith('a1', true)
  })
})
