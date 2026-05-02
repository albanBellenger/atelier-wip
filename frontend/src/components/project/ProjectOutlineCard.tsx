import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'

import type { IssueRow, SectionStatus, SectionSummary, WorkOrder } from '../../services/api'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'

function markdownFilename(slug: string): string {
  const t = slug.trim()
  if (t.endsWith('.md')) return t
  return `${t}.md`
}

export type ProjectOutlineCardProps = {
  sections: SectionSummary[]
  workOrders: WorkOrder[]
  /** Open issues for this project (used for per-section counts). */
  issues: IssueRow[]
  canManageOutline: boolean
  onSelectSection: (sectionId: string) => void
  onDeleteSection: (sectionId: string) => void
  onReorder: (orderedIds: string[]) => void
  newTitle: string
  onNewTitleChange: (value: string) => void
  onAddSection: () => void
}

function DragHandleIcon(): ReactElement {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1" />
      <circle cx="6" cy="2" r="1" />
      <circle cx="2" cy="7" r="1" />
      <circle cx="6" cy="7" r="1" />
      <circle cx="2" cy="12" r="1" />
      <circle cx="6" cy="12" r="1" />
    </svg>
  )
}

function countWorkOrdersForSection(
  sectionId: string,
  workOrders: WorkOrder[],
): number {
  return workOrders.filter(
    (w) => w.section_ids.includes(sectionId) && w.status !== 'archived',
  ).length
}

function countOpenIssuesForSection(
  sectionId: string,
  issues: IssueRow[],
): number {
  return issues.filter(
    (i) =>
      i.status === 'open' &&
      (i.section_a_id === sectionId || i.section_b_id === sectionId),
  ).length
}

function landingStatusPill(
  status: SectionStatus,
): { label: string; className: string } {
  switch (status) {
    case 'ready':
      return {
        label: 'Complete',
        className:
          'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
      }
    case 'gaps':
      return {
        label: 'In progress',
        className:
          'border-amber-500/35 bg-amber-500/10 text-amber-300 ring-amber-500/25',
      }
    case 'conflict':
      return {
        label: 'Conflict',
        className:
          'border-rose-500/35 bg-rose-500/10 text-rose-300 ring-rose-500/25',
      }
    case 'empty':
    default:
      return {
        label: 'Todo',
        className:
          'border-zinc-600 bg-zinc-800/50 text-zinc-400 ring-zinc-600/40',
      }
  }
}

function LandingStatusPill(props: { status: SectionStatus }): ReactElement {
  const { status } = props
  const { label, className } = landingStatusPill(status)
  return (
    <span
      data-testid={`section-status-pill-${status}`}
      title={label}
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  )
}

function sectionMetadataLine(section: SectionSummary): string {
  const edited = formatRelativeTimeUtc(section.updated_at)
  if (section.status === 'empty') {
    return edited ? `empty · edited ${edited}` : 'empty · edited —'
  }
  return edited ? `edited ${edited}` : 'edited —'
}

function OutlineRowStatic(props: {
  section: SectionSummary
  index: number
  workOrders: WorkOrder[]
  issues: IssueRow[]
  showModifiedDot: boolean
  onSelect: () => void
}): ReactElement {
  const { section, index, workOrders, issues, showModifiedDot, onSelect } =
    props
  const woN = countWorkOrdersForSection(section.id, workOrders)
  const issueN = countOpenIssuesForSection(section.id, issues)
  const idx = String(index + 1).padStart(2, '0')

  return (
    <li
      className="group relative grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-3 px-5 py-3.5 hover:bg-zinc-900/50"
    >
      <span className="w-5 shrink-0" aria-hidden />
      <span className="w-7 shrink-0 select-none font-mono text-[10px] text-zinc-600">
        {idx}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="truncate text-left text-[14px] font-medium text-zinc-100 hover:text-violet-200 hover:underline"
          >
            {section.title}
          </button>
          <span className="shrink-0 font-mono text-[11px] text-zinc-600">
            {markdownFilename(section.slug)}
          </span>
          {showModifiedDot ? (
            <span
              title="Needs attention"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              aria-hidden
            />
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {sectionMetadataLine(section)}
        </p>
      </div>
      <LandingStatusPill status={section.status} />
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-zinc-500">
        {woN} WOs
      </span>
      {issueN > 0 ? (
        <span className="inline-flex shrink-0 justify-end">
          <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-200">
            {issueN} issue{issueN === 1 ? '' : 's'}
          </span>
        </span>
      ) : (
        <span className="w-16 shrink-0 text-right font-mono text-[11px] text-zinc-700">
          —
        </span>
      )}
      <span className="w-4 shrink-0 text-center font-mono text-[11px] text-zinc-700">
        —
      </span>
    </li>
  )
}

function OutlineRowSortable(props: {
  section: SectionSummary
  index: number
  workOrders: WorkOrder[]
  issues: IssueRow[]
  showModifiedDot: boolean
  onSelect: () => void
  onDelete: () => void
}): ReactElement {
  const {
    section,
    index,
    workOrders,
    issues,
    showModifiedDot,
    onSelect,
    onDelete,
  } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  }

  const woN = countWorkOrdersForSection(section.id, workOrders)
  const issueN = countOpenIssuesForSection(section.id, issues)
  const idx = String(index + 1).padStart(2, '0')

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group relative grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-3 px-5 py-3.5 hover:bg-zinc-900/50"
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-zinc-600 hover:text-zinc-300 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon />
      </button>
      <span className="w-7 shrink-0 select-none font-mono text-[10px] text-zinc-600">
        {idx}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="truncate text-left text-[14px] font-medium text-zinc-100 hover:text-violet-200 hover:underline"
          >
            {section.title}
          </button>
          <span className="shrink-0 font-mono text-[11px] text-zinc-600">
            {markdownFilename(section.slug)}
          </span>
          {showModifiedDot ? (
            <span
              title="Needs attention"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              aria-hidden
            />
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {sectionMetadataLine(section)}
        </p>
      </div>
      <LandingStatusPill status={section.status} />
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-zinc-500">
        {woN} WOs
      </span>
      {issueN > 0 ? (
        <span className="inline-flex shrink-0 justify-end">
          <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-200">
            {issueN} issue{issueN === 1 ? '' : 's'}
          </span>
        </span>
      ) : (
        <span className="w-16 shrink-0 text-right font-mono text-[11px] text-zinc-700">
          —
        </span>
      )}
      <div className="flex w-12 shrink-0 items-center justify-end gap-1">
        <button
          type="button"
          className="rounded px-1 text-[11px] text-zinc-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
          onClick={() => {
            if (window.confirm(`Delete section "${section.title}"?`)) {
              onDelete()
            }
          }}
        >
          Delete
        </button>
        <span className="font-mono text-[11px] text-zinc-700">—</span>
      </div>
    </li>
  )
}

type FilterKey = 'all' | SectionStatus

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ready', label: 'Complete' },
  { key: 'gaps', label: 'In progress' },
  { key: 'conflict', label: 'Conflict' },
  { key: 'empty', label: 'Todo' },
]

export function ProjectOutlineCard(props: ProjectOutlineCardProps): ReactElement {
  const {
    sections,
    workOrders,
    issues,
    canManageOutline,
    onSelectSection,
    onDeleteSection,
    onReorder,
    newTitle,
    onNewTitleChange,
    onAddSection,
  } = props

  const [filter, setFilter] = useState<FilterKey>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const filteredSections = useMemo(() => {
    if (filter === 'all') return sections
    return sections.filter((s) => s.status === filter)
  }, [sections, filter])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const ids = filteredSections.map((s) => s.id)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || filter !== 'all') {
      return
    }
    const fullIds = sections.map((s) => s.id)
    const oldIndex = fullIds.indexOf(String(active.id))
    const newIndex = fullIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) {
      return
    }
    const next = arrayMove(sections, oldIndex, newIndex)
    onReorder(next.map((s) => s.id))
  }

  const filterLabel =
    FILTER_OPTIONS.find((o) => o.key === filter)?.label ?? 'All'

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h3 className="text-[13px] font-semibold text-zinc-100">Outline</h3>
          <span className="text-[11px] text-zinc-600">
            {sections.length} sections
            {canManageOutline ? ' · drag to reorder' : ''}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              onBlur={() => setTimeout(() => setFilterOpen(false), 120)}
              className="rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Filter{filter !== 'all' ? `: ${filterLabel}` : ''}
            </button>
            {filterOpen ? (
              <div className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[10rem] rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`flex w-full px-3 py-2 text-left text-[12px] hover:bg-zinc-900 ${
                      filter === opt.key
                        ? 'bg-zinc-900 text-zinc-100'
                        : 'text-zinc-400'
                    }`}
                    onMouseDown={() => {
                      setFilter(opt.key)
                      setFilterOpen(false)
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {canManageOutline ? (
            <button
              type="button"
              className="rounded-md bg-violet-600 px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
              onClick={() => {
                setAddOpen(true)
              }}
            >
              + New section
            </button>
          ) : null}
        </div>
      </div>

      {canManageOutline && addOpen ? (
        <div className="flex flex-wrap gap-2 border-b border-zinc-800/80 bg-zinc-950/40 px-5 py-3">
          <input
            className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600"
            placeholder="New section title"
            value={newTitle}
            onChange={(e) => onNewTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAddSection()
                setAddOpen(false)
              }
            }}
            autoFocus
          />
          <button
            type="button"
            className="rounded-md bg-violet-600 px-3 py-2 text-[12px] font-medium text-white hover:brightness-110"
            onClick={() => {
              onAddSection()
              setAddOpen(false)
            }}
          >
            Add
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-2 text-[12px] text-zinc-400 hover:text-zinc-200"
            onClick={() => setAddOpen(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {filteredSections.length === 0 ? (
        <p className="px-5 py-8 text-[13px] text-zinc-500">
          {sections.length === 0
            ? 'No sections yet.'
            : 'No sections match this filter.'}
        </p>
      ) : canManageOutline && filter === 'all' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-zinc-800/60">
              {filteredSections.map((section, i) => {
                const baseIndex = sections.findIndex((s) => s.id === section.id)
                const showDot =
                  section.status === 'gaps' || section.status === 'conflict'
                return (
                  <OutlineRowSortable
                    key={section.id}
                    section={section}
                    index={baseIndex >= 0 ? baseIndex : i}
                    workOrders={workOrders}
                    issues={issues}
                    showModifiedDot={showDot}
                    onSelect={() => onSelectSection(section.id)}
                    onDelete={() => onDeleteSection(section.id)}
                  />
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="divide-y divide-zinc-800/60">
          {filteredSections.map((section, i) => {
            const baseIndex = sections.findIndex((s) => s.id === section.id)
            const showDot =
              section.status === 'gaps' || section.status === 'conflict'
            return (
              <OutlineRowStatic
                key={section.id}
                section={section}
                index={baseIndex >= 0 ? baseIndex : i}
                workOrders={workOrders}
                issues={issues}
                showModifiedDot={showDot}
                onSelect={() => onSelectSection(section.id)}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}
