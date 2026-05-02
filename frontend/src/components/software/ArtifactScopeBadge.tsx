import type { ReactElement } from 'react'

import type { ArtifactScopeLevel } from '../../services/api'

function scopeClass(level: ArtifactScopeLevel): string {
  if (level === 'studio') {
    return 'border border-amber-500/40 bg-amber-950/60 text-amber-200'
  }
  if (level === 'software') {
    return 'border border-violet-500/40 bg-violet-950/55 text-violet-200'
  }
  return 'border border-sky-500/40 bg-sky-950/55 text-sky-200'
}

function scopeLabel(level: ArtifactScopeLevel): string {
  if (level === 'studio') return 'Studio'
  if (level === 'software') return 'Software'
  return 'Project'
}

export function ArtifactScopeBadge(props: {
  level: ArtifactScopeLevel
}): ReactElement {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${scopeClass(props.level)}`}
    >
      {scopeLabel(props.level)}
    </span>
  )
}
