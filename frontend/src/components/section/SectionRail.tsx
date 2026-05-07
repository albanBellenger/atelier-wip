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
import { Link } from 'react-router-dom'
import type { ReactElement } from 'react'
import { useCallback, useId, useState } from 'react'

import type { Section, SectionStatus } from '../../services/api'

/** When set, an "Add section" control is shown after the last section (outline managers only). */
export type SectionRailAddSectionHandlers = {
  onCreate: (input: { title: string; slug: string | null }) => Promise<void>
  isPending: boolean
}

/** When set, section rows can be reordered via drag handle (outline managers only). */
export type SectionRailReorderHandlers = {
  onReorder: (orderedIds: string[]) => void
  isPending: boolean
}

/** Returns the new id order after dragging `activeId` onto `overId`, or null if no change. */
export function reorderSectionIdsAfterDrag(
  orderedIds: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  if (activeId === overId) {
    return null
  }
  const oldIndex = orderedIds.indexOf(activeId)
  const newIndex = orderedIds.indexOf(overId)
  if (oldIndex < 0 || newIndex < 0) {
    return null
  }
  return arrayMove([...orderedIds], oldIndex, newIndex)
}

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

function SectionRailRowInner(props: {
  section: Section
  index: number
  active: boolean
}): ReactElement {
  const { section: s, index: i, active } = props
  return (
    <>
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
    </>
  )
}

function SortableSectionRow(props: {
  section: Section
  index: number
  sectionBaseHref: string
  activeSectionId: string
  dragDisabled: boolean
}): ReactElement {
  const { section: s, index: i, sectionBaseHref, activeSectionId, dragDisabled } =
    props
  const active = s.id === activeSectionId
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id, disabled: dragDisabled })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  }
  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`group relative flex w-full items-start gap-1 px-2 py-2 transition ${
          active ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'
        }`}
      >
        {active ? (
          <span
            className="absolute left-0 top-2 h-6 w-[2px] rounded-r bg-violet-500"
            aria-hidden
          />
        ) : null}
        <button
          type="button"
          aria-label="Drag to reorder"
          data-testid="section-rail-drag-handle"
          disabled={dragDisabled}
          className={`mt-0.5 flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-300 active:cursor-grabbing ${
            dragDisabled ? 'cursor-not-allowed opacity-40' : ''
          }`}
          {...(dragDisabled ? {} : { ...attributes, ...listeners })}
        >
          <DragHandleIcon />
        </button>
        <Link
          to={`${sectionBaseHref}/${s.id}`}
          title={sectionRowTitle(s)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left no-underline"
        >
          <SectionRailRowInner section={s} index={i} active={active} />
        </Link>
      </div>
    </li>
  )
}

export function SectionRail(props: {
  studioId: string
  softwareId: string
  projectId: string
  sections: Section[]
  activeSectionId: string
  collapsed: boolean
  onToggleCollapsed: () => void
  addSection?: SectionRailAddSectionHandlers
  reorderSections?: SectionRailReorderHandlers
}): ReactElement {
  const {
    studioId,
    softwareId,
    projectId,
    sections,
    activeSectionId,
    collapsed,
    onToggleCollapsed,
    addSection,
    reorderSections,
  } = props
  const base = `/studios/${studioId}/software/${softwareId}/projects/${projectId}/sections`
  const addDialogHeadingId = useId()
  const titleInputId = useId()
  const slugInputId = useId()
  const [addOpen, setAddOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSlug, setDraftSlug] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!reorderSections) {
        return
      }
      const { active, over } = event
      if (!over || active.id === over.id) {
        return
      }
      const next = reorderSectionIdsAfterDrag(
        sections.map((x) => x.id),
        String(active.id),
        String(over.id),
      )
      if (next) {
        reorderSections.onReorder(next)
      }
    },
    [reorderSections, sections],
  )

  const resetAddForm = (): void => {
    setDraftTitle('')
    setDraftSlug('')
    setAddError(null)
    setAddOpen(false)
  }

  const openAddForm = (): void => {
    setDraftTitle('')
    setDraftSlug('')
    setAddError(null)
    setAddOpen(true)
  }

  const submitAdd = async (): Promise<void> => {
    if (!addSection) {
      return
    }
    setAddError(null)
    const title = draftTitle.trim() || 'Untitled'
    const slugRaw = draftSlug.trim()
    try {
      await addSection.onCreate({
        title,
        slug: slugRaw.length > 0 ? slugRaw : null,
      })
      resetAddForm()
    } catch {
      setAddError('Could not create section.')
    }
  }

  return (
    <aside
      className={`shrink-0 border-r border-zinc-800/80 bg-zinc-950/40 transition-all ${
        collapsed ? 'w-12' : 'flex min-h-0 w-60 flex-col self-stretch'
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
        !reorderSections && !addSection ? (
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
                    <SectionRailRowInner
                      section={s}
                      index={i}
                      active={active}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex max-h-[calc(100vh-12rem)] min-h-0 flex-1 flex-col overflow-hidden">
            {reorderSections ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={sections.map((x) => x.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                    {sections.map((s, i) => (
                      <SortableSectionRow
                        key={s.id}
                        section={s}
                        index={i}
                        sectionBaseHref={base}
                        activeSectionId={activeSectionId}
                        dragDisabled={reorderSections.isPending}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto py-1">
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
                        <SectionRailRowInner
                          section={s}
                          index={i}
                          active={active}
                        />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            {addSection ? (
              <div className="shrink-0 border-t border-zinc-800/60 px-2 py-2">
                {!addOpen ? (
                  <button
                    type="button"
                    data-testid="section-rail-add-open"
                    className="w-full rounded px-2 py-1.5 text-left text-[12.5px] text-zinc-400 transition hover:bg-zinc-900/80 hover:text-zinc-200"
                    onClick={openAddForm}
                  >
                    Add section
                  </button>
                ) : (
                  <div
                    role="dialog"
                    aria-labelledby={addDialogHeadingId}
                    className="rounded-md border border-zinc-700/80 bg-zinc-900/90 p-2 shadow-lg"
                  >
                    <h3 id={addDialogHeadingId} className="sr-only">
                      New section
                    </h3>
                    <label
                      htmlFor={titleInputId}
                      className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                    >
                      Title
                    </label>
                    <input
                      id={titleInputId}
                      data-testid="section-rail-add-title"
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="Untitled"
                      className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      autoComplete="off"
                    />
                    <label
                      htmlFor={slugInputId}
                      className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                    >
                      Slug
                    </label>
                    <input
                      id={slugInputId}
                      data-testid="section-rail-add-slug"
                      type="text"
                      value={draftSlug}
                      onChange={(e) => setDraftSlug(e.target.value)}
                      placeholder="optional — derived from title if empty"
                      className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      autoComplete="off"
                    />
                    {addError ? (
                      <p className="mb-2 text-[11px] text-rose-400">{addError}</p>
                    ) : null}
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        data-testid="section-rail-add-cancel"
                        className="rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        disabled={addSection.isPending}
                        onClick={resetAddForm}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="section-rail-add-create"
                        className="rounded bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                        disabled={addSection.isPending}
                        onClick={() => void submitAdd()}
                      >
                        {addSection.isPending ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </aside>
  )
}
