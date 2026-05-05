import type { ReactElement } from 'react'

import type { Section } from '../../../services/api'
import { SectionRail } from '../../section/SectionRail'

export function OutlineRail(props: {
  studioId: string
  softwareId: string
  projectId: string
  sections: Section[]
  activeSectionId: string
  collapsed: boolean
  onToggleCollapsed: () => void
  pinned?: boolean
}): ReactElement {
  const { pinned, collapsed, onToggleCollapsed, ...rest } = props
  return (
    <div
      className={`relative shrink-0 ${pinned ? 'ring-1 ring-zinc-700/50' : ''}`}
      data-testid="outline-rail-v2"
    >
      <SectionRail
        {...rest}
        collapsed={pinned ? false : collapsed}
        onToggleCollapsed={pinned ? () => {} : onToggleCollapsed}
      />
    </div>
  )
}
