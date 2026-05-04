import { Link } from 'react-router-dom'
import type { ReactElement } from 'react'

import type { Section, SectionStatus } from '../../services/api'

const STATUS_SHORT: Record<SectionStatus, string> = {
  ready: 'Done',
  gaps: 'Gaps',
  conflict: 'Conflict',
  empty: 'Draft',
}

const STATUS_DETAIL: Record<SectionStatus, string> = {
  ready: 'Section reads complete for this milestone.',
  gaps: 'Open gaps or follow-ups remain.',
  conflict: 'Conflicting statements need resolution.',
  empty: 'Outline or body not filled in yet.',
}

const STATUS_DOT: Record<SectionStatus, string> = {
  ready: 'bg-emerald-400',
  gaps: 'bg-amber-400',
  conflict: 'bg-rose-400',
  empty: 'bg-violet-400',
}

function sectionRowTitle(s: Section): string {
  const detail = STATUS_DETAIL[s.status]
  const oh = s.outline_health
  if (oh == null) {
    return `${s.title} · ${detail}`
  }
  const pending =
    oh.citation_scan_pending === true
      ? ' Full citation scan when you open the section.'
      : ''
  return `${s.title} · ${detail} — Drift ${String(oh.drift_count)}, gaps ${String(oh.gap_count)}, ~${String(oh.token_used)}/${String(oh.token_budget)} tokens.${pending}`
}

export function SectionRail(props: {
  studioId: string
  softwareId: string
  projectId: string
  sections: Section[]
  activeSectionId: string
  collapsed: boolean
  onToggleCollapsed: () => void
}): ReactElement {
  const {
    studioId,
    softwareId,
    projectId,
    sections,
    activeSectionId,
    collapsed,
    onToggleCollapsed,
  } = props
  const base = `/studios/${studioId}/software/${softwareId}/projects/${projectId}/sections`

  return (
    <aside
      className={`shrink-0 border-r border-zinc-800/80 bg-zinc-950/40 transition-all ${
        collapsed ? 'w-12' : 'w-60'
      }`}
      aria-label="Section outline"
    >
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-2.5">
        {!collapsed ? (
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            Outline
          </span>
        ) : null}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          aria-label={collapsed ? 'Expand outline' : 'Collapse outline'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d={
                collapsed
                  ? 'M4 3l4 3-4 3'
                  : 'M8 3l-4 3 4 3'
              }
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {!collapsed ? (
        <ul className="max-h-[calc(100vh-12rem)] overflow-y-auto py-1">
          {sections.map((s, i) => {
            const active = s.id === activeSectionId
            return (
              <li key={s.id}>
                <Link
                  to={`${base}/${s.id}`}
                  title={sectionRowTitle(s)}
                  className={`group relative flex w-full items-start gap-2 px-3 py-2 text-left transition ${
                    active ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  {active ? (
                    <span
                      className="absolute left-0 top-2 h-6 w-[2px] rounded-r bg-violet-500"
                      aria-hidden
                    />
                  ) : null}
                  <span className="mt-0.5 select-none font-mono text-[10px] text-zinc-600">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[12.5px] ${
                        active ? 'text-zinc-100' : 'text-zinc-300'
                      }`}
                    >
                      {s.title}
                    </div>
                    <div className="truncate font-mono text-[10px] text-zinc-600">
                      {s.slug}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <div
                      className="flex items-center gap-1"
                      title={STATUS_DETAIL[s.status]}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[s.status]}`}
                        aria-hidden
                      />
                      <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                        {STATUS_SHORT[s.status]}
                      </span>
                    </div>
                    {s.open_issue_count > 0 ? (
                      <span className="font-mono text-[9.5px] text-rose-300">
                        {s.open_issue_count}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </aside>
  )
}
