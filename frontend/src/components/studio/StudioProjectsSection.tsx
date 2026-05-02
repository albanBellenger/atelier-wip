import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import type { StudioProjectRow } from '../../services/api'

export function StudioProjectsSection(props: {
  studioId: string
  projects: StudioProjectRow[] | undefined
  isPending: boolean
}): ReactElement {
  const { studioId, projects, isPending } = props
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)

  const displayed = useMemo(() => {
    const rows = projects ?? []
    return showArchivedProjects ? rows : rows.filter((p) => !p.archived)
  }, [projects, showArchivedProjects])

  const activeCount = useMemo(
    () => (projects ?? []).filter((p) => !p.archived).length,
    [projects],
  )
  const totalCount = (projects ?? []).length

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-zinc-800 px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
            Projects
          </h2>
          {projects != null ? (
            <span className="text-[13px] text-zinc-500">
              {activeCount} of {totalCount}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-5">
          <div className="flex shrink-0 items-center gap-2.5">
            <span
              id="studio-projects-archived-label"
              className="shrink-0 text-[12px] text-zinc-500"
            >
              Show archived
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showArchivedProjects}
              aria-labelledby="studio-projects-archived-label"
              onClick={() => setShowArchivedProjects((v) => !v)}
              className={`relative h-5 w-9 shrink-0 overflow-hidden rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
                showArchivedProjects
                  ? 'border-violet-500 bg-violet-600'
                  : 'border-zinc-600 bg-zinc-800'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-zinc-100 shadow transition-transform ${
                  showArchivedProjects
                    ? 'translate-x-[1.125rem]'
                    : 'translate-x-0.5'
                }`}
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>
      {isPending && (
        <p className="px-5 py-6 text-[13px] text-zinc-500">Loading projects…</p>
      )}
      {projects && displayed.length === 0 && (
        <p className="px-5 py-6 text-[13px] text-zinc-500">No projects yet.</p>
      )}
      {projects && displayed.length > 0 ? (
        <ul className="divide-y divide-zinc-800">
          {displayed.map((p) => {
            const woDone = p.work_orders_done
            const woTotal = p.work_orders_total
            const pct =
              woTotal > 0 ? Math.min(100, Math.round((woDone / woTotal) * 100)) : 0
            const edited =
              formatRelativeTimeUtc(p.last_edited_at ?? p.updated_at) ?? null
            return (
              <li key={p.id}>
                <Link
                  to={`/studios/${studioId}/software/${p.software_id}/projects/${p.id}`}
                  className="group relative flex gap-0 border-l-[3px] border-l-transparent pl-0 transition-colors hover:bg-zinc-800/40"
                >
                  <div className="min-w-0 flex-1 px-5 py-4 pr-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                          {p.name}
                        </span>
                        {p.archived ? (
                          <span className="shrink-0 rounded-full border border-zinc-600 bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                            archived
                          </span>
                        ) : null}
                        <span className="shrink-0 rounded-full border border-zinc-600/80 bg-zinc-800/60 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                          {p.software_name}
                        </span>
                      </div>
                    </div>
                    {p.description ? (
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">
                        {p.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-zinc-500">
                      <p>
                        <span className="text-zinc-500">Work orders · </span>
                        <span className="font-medium text-zinc-100">{woDone}</span>
                        <span className="text-zinc-500">
                          {' '}
                          / {woTotal} done
                        </span>
                      </p>
                      <p className="text-zinc-500">
                        {p.sections_count}{' '}
                        {p.sections_count === 1 ? 'section' : 'sections'}
                        {edited ? (
                          <>
                            {' '}
                            · edited {edited}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div
                      className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full bg-violet-600 transition-all group-hover:bg-violet-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
