import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { compareWorkOrdersKanban } from '../../lib/workOrderKanbanSort'
import type { SectionSummary, WorkOrder } from '../../services/api'

const WO_KANBAN_STATUSES = [
  'backlog',
  'in_progress',
  'in_review',
  'done',
] as const

const WO_STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  archived: 'Archived',
}

export type ProjectWorkOrderKanbanPreviewProps = {
  studioId: string
  softwareId: string
  projectId: string
  workOrders: WorkOrder[]
  sectionsById: Map<string, SectionSummary>
}

function woAssigneeInitials(display: string | null | undefined): string {
  const t = (display ?? '').trim()
  if (!t) return '—'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  const a = parts[0][0] ?? ''
  const b = parts[parts.length - 1][0] ?? ''
  return `${a}${b}`.toUpperCase()
}

function sectionMarkdownRef(
  wo: WorkOrder,
  sectionsById: Map<string, SectionSummary>,
): string {
  const sid = wo.section_ids[0]
  if (!sid) return '—'
  const slug = sectionsById.get(sid)?.slug
  if (!slug) return '—'
  const t = slug.trim()
  return t.endsWith('.md') ? t : `${t}.md`
}

/** Stable short label for cards (UUIDs are not human-friendly). */
function workOrderCardId(wo: WorkOrder): string {
  const hex = wo.id.replace(/-/g, '').toUpperCase()
  return `WO-${hex.slice(0, 6)}`
}

type GroupBy = 'status' | 'phase'

type KanbanColumn = {
  key: string
  header: string
  items: WorkOrder[]
}

function buildStatusColumns(active: WorkOrder[]): KanbanColumn[] {
  return WO_KANBAN_STATUSES.map((status) => ({
    key: status,
    header: (WO_STATUS_LABEL[status] ?? status).toUpperCase(),
    items: active
      .filter((w) => w.status === status)
      .slice()
      .sort(compareWorkOrdersKanban),
  }))
}

function buildPhaseColumns(active: WorkOrder[]): KanbanColumn[] {
  const map = new Map<string, WorkOrder[]>()
  for (const w of active) {
    const raw = w.phase?.trim()
    const key = raw && raw.length > 0 ? raw : '__unassigned__'
    const bucket = map.get(key)
    if (bucket) {
      bucket.push(w)
    } else {
      map.set(key, [w])
    }
  }
  const entries = [...map.entries()]
  entries.sort(([a], [b]) => {
    if (a === '__unassigned__') return 1
    if (b === '__unassigned__') return -1
    return a.localeCompare(b)
  })
  return entries.map(([key, items]) => {
    const upper =
      key === '__unassigned__'
        ? 'UNASSIGNED'
        : key.length > 40
          ? `${key.slice(0, 37).toUpperCase()}…`
          : key.toUpperCase()
    return {
      key,
      header: upper,
      items: items.slice().sort(compareWorkOrdersKanban),
    }
  })
}

export function ProjectWorkOrderKanbanPreview(
  props: ProjectWorkOrderKanbanPreviewProps,
): ReactElement {
  const { studioId, softwareId, projectId, workOrders, sectionsById } = props
  const [groupBy, setGroupBy] = useState<GroupBy>('status')

  const active = useMemo(
    () => workOrders.filter((w) => w.status !== 'archived'),
    [workOrders],
  )

  const columns = useMemo((): KanbanColumn[] => {
    return groupBy === 'status'
      ? buildStatusColumns(active)
      : buildPhaseColumns(active)
  }, [active, groupBy])

  const boardPath = `/studios/${studioId}/software/${softwareId}/projects/${projectId}/work-orders`

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h3 className="text-[13px] font-semibold text-zinc-100">Work orders</h3>
          <span className="text-[11px] text-zinc-600">
            {active.length} active
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setGroupBy('status')}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                groupBy === 'status'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              by status
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('phase')}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                groupBy === 'phase'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              by phase
            </button>
          </div>
          <Link
            to={boardPath}
            className="text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            Open board →
          </Link>
        </div>
      </div>

      <div
        className={
          groupBy === 'phase'
            ? 'flex gap-px overflow-x-auto bg-zinc-800/40 p-px'
            : 'grid grid-cols-1 gap-px bg-zinc-800/40 p-px sm:grid-cols-2 lg:grid-cols-4'
        }
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={`min-h-[220px] bg-zinc-950/30 p-3 ${
              groupBy === 'phase' ? 'w-[min(100%,240px)] shrink-0 sm:w-60' : ''
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {col.header}
              </span>
              <span className="font-mono text-[10px] text-zinc-600">
                {col.items.length}
              </span>
            </div>
            <div className="space-y-2">
              {col.items.map((w) => (
                <Link
                  key={w.id}
                  to={boardPath}
                  className="block rounded-lg border border-zinc-800 bg-zinc-900/90 p-3 transition-colors hover:border-zinc-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {workOrderCardId(w)}
                    </span>
                    {w.is_stale ? (
                      <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                        stale
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px] font-medium leading-snug text-zinc-50">
                    {w.title}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-[10.5px] text-zinc-500">
                      {sectionMarkdownRef(w, sectionsById)}
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-medium ${
                        w.assignee_display_name
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                          : 'border-dashed border-zinc-700 text-zinc-600'
                      }`}
                      title={w.assignee_display_name ?? 'Unassigned'}
                    >
                      {woAssigneeInitials(w.assignee_display_name)}
                    </span>
                  </div>
                </Link>
              ))}
              {col.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-center text-[11px] text-zinc-600">
                  empty
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
