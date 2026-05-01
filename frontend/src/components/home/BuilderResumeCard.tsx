import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import type { SectionSummary, SectionStatus, WorkOrder } from '../../services/api'

export type BuilderResumeCardProps = {
  studioId: string
  softwareId: string
  projectId: string
  projectName: string | null
  projectUpdatedAt: string | null
  sections: SectionSummary[] | null | undefined
  workOrders: WorkOrder[] | undefined
  isPending: boolean
}

type ResumeRow =
  | {
      kind: 'section'
      id: string
      title: string
      subline: string
      statusRight: string
      href: string
      sortKey: number
    }
  | {
      kind: 'wo'
      id: string
      title: string
      subline: string
      statusRight: string
      href: string
      sortKey: number
    }

function sectionStatusLabel(status: SectionStatus): string {
  const labels: Record<SectionStatus, string> = {
    ready: 'Ready',
    gaps: 'Gaps',
    conflict: 'Conflict',
    empty: 'Empty',
  }
  return labels[status]
}

function workOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    backlog: 'Backlog',
    in_progress: 'In progress',
    in_review: 'In review',
    done: 'Done',
    archived: 'Archived',
  }
  return map[status] ?? status.replace(/_/g, ' ')
}

function buildMergeRows(
  studioId: string,
  softwareId: string,
  projectId: string,
  sections: SectionSummary[] | null | undefined,
  workOrders: WorkOrder[] | undefined,
): ResumeRow[] {
  const secList = sections ?? []
  const woList = workOrders ?? []

  const sectionRows: ResumeRow[] = secList.map((s) => {
    const ts = Date.parse(s.updated_at)
    return {
      kind: 'section',
      id: s.id,
      title: s.title,
      subline: `Section · ${formatRelativeTimeUtc(s.updated_at)}`,
      statusRight: sectionStatusLabel(s.status),
      href: `/studios/${studioId}/software/${softwareId}/projects/${projectId}/sections/${s.id}`,
      sortKey: Number.isFinite(ts) ? ts : 0,
    }
  })

  const woRows: ResumeRow[] = woList.map((w) => {
    const ts = Date.parse(w.updated_at)
    return {
      kind: 'wo',
      id: w.id,
      title: w.title,
      subline: `Work order · ${formatRelativeTimeUtc(w.updated_at)}`,
      statusRight: workOrderStatusLabel(w.status),
      href: `/studios/${studioId}/software/${softwareId}/projects/${projectId}/work-orders`,
      sortKey: Number.isFinite(ts) ? ts : 0,
    }
  })

  const merged = [...sectionRows, ...woRows].sort((a, b) => b.sortKey - a.sortKey)
  return merged.slice(0, 4)
}

export function BuilderResumeCard(props: BuilderResumeCardProps): ReactElement {
  const {
    studioId,
    softwareId,
    projectId,
    projectName,
    projectUpdatedAt,
    sections,
    workOrders,
    isPending,
  } = props

  const merged = buildMergeRows(studioId, softwareId, projectId, sections, workOrders)
  const chatHref = `/studios/${studioId}/software/${softwareId}/projects/${projectId}?tab=chat`
  const chatSub =
    projectUpdatedAt != null && projectUpdatedAt.length > 0
      ? formatRelativeTimeUtc(projectUpdatedAt)
      : 'Project'

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h3 className="text-[13px] font-medium text-zinc-200">Resume</h3>
      {isPending ? (
        <ul className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="animate-pulse rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
            >
              <div className="h-3 w-2/3 rounded bg-zinc-800" />
              <div className="mt-2 h-2 w-1/3 rounded bg-zinc-800/80" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 space-y-1">
          {merged.map((row, idx) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                to={row.href}
                className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-zinc-800/50"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    idx === 0 ? 'bg-violet-500' : 'bg-zinc-600'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-zinc-100">
                    {row.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{row.subline}</div>
                </div>
                <span className="shrink-0 pt-0.5 text-[11px] text-zinc-400">
                  {row.statusRight}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to={chatHref}
              className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-zinc-800/50"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-zinc-100">
                  Project chat
                </div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {projectName ? `${projectName} · ${chatSub}` : chatSub}
                </div>
              </div>
              <span className="shrink-0 pt-0.5 text-[11px] text-zinc-400">Chat</span>
            </Link>
          </li>
        </ul>
      )}
    </section>
  )
}
