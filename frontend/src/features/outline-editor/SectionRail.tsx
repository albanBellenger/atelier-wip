import type { ReactElement } from 'react'

import type { OeSection } from './types'

export function SectionRail(props: {
  sections: OeSection[]
  activeId: string
  accent: string
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelect: (id: string) => void
}): ReactElement {
  const { sections, activeId, accent, collapsed, onToggleCollapsed, onSelect } =
    props
  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-zinc-800/80 bg-[#0a0a0b] transition-[width] duration-150 ${
        collapsed ? 'w-12' : 'w-60'
      }`}
    >
      <div className="flex h-11 shrink-0 items-center justify-end border-b border-zinc-800/80 px-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          aria-label={collapsed ? 'Expand section list' : 'Collapse section list'}
        >
          <span className="font-mono text-sm">{collapsed ? '→' : '←'}</span>
        </button>
      </div>
      {!collapsed ? (
        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          {sections.map((s) => {
            const active = s.id === activeId
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={`flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left hover:bg-zinc-900/40 ${
                  active ? '' : 'border-transparent'
                }`}
                style={
                  active
                    ? {
                        borderLeftColor: accent,
                        backgroundColor: 'rgb(24 24 27 / 0.35)',
                      }
                    : undefined
                }
              >
                <span className="font-mono text-[10.5px] text-zinc-500">{s.num}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-100">{s.title}</div>
                  <div className="truncate font-mono text-[10px] text-zinc-500">
                    {s.slug}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        s.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    {s.issueCount > 0 ? (
                      <span className="font-mono text-[10px] text-zinc-500">
                        {s.issueCount} issues
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-zinc-500">ok</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </nav>
      ) : null}
    </aside>
  )
}
