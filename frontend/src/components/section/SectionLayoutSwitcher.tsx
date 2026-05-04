import type { ReactElement } from 'react'

import type { SectionLayoutMode } from './sectionLayoutMode'

const SEGMENTS: { id: SectionLayoutMode; label: string; prefix?: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'preview', label: 'Preview' },
  { id: 'split', label: 'Split' },
  { id: 'context', label: 'Context' },
  { id: 'focus', label: 'Focus', prefix: '✦ ' },
]

export function SectionLayoutSwitcher(props: {
  mode: SectionLayoutMode
  onChange: (mode: SectionLayoutMode) => void
}): ReactElement {
  const { mode, onChange } = props
  return (
    <div
      className="flex shrink-0 flex-wrap gap-1 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-1"
      role="tablist"
      aria-label="Section layout"
      data-testid="section-layout-switcher"
    >
      {SEGMENTS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={mode === s.id}
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
            mode === s.id
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          onClick={() => onChange(s.id)}
        >
          {s.prefix}
          {s.label}
        </button>
      ))}
    </div>
  )
}
