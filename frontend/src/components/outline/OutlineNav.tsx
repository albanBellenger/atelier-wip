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
import type { SectionSummary } from '../../services/api'

function OutlineRowReadOnly(props: {
  section: SectionSummary
  selected: boolean
  onSelect: (id: string) => void
}): ReactElement {
  const { section, selected, onSelect } = props
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
        selected
          ? 'border-violet-500 bg-violet-950/40 text-zinc-100'
          : 'border-zinc-700 bg-zinc-900/50 text-zinc-300'
      }`}
    >
      <span className="w-6" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:underline"
        onClick={() => onSelect(section.id)}
      >
        {section.title}
      </button>
    </div>
  )
}

function SortableRow(props: {
  section: SectionSummary
  selected: boolean
  isStudioAdmin: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}): ReactElement {
  const { section, selected, isStudioAdmin, onSelect, onDelete } = props
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
    opacity: isDragging ? 0.85 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
        selected
          ? 'border-violet-500 bg-violet-950/40 text-zinc-100'
          : 'border-zinc-700 bg-zinc-900/50 text-zinc-300'
      }`}
    >
      {isStudioAdmin ? (
        <button
          type="button"
          className="cursor-grab touch-none px-1 text-zinc-500 hover:text-zinc-300"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
      ) : (
        <span className="w-6" />
      )}
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:underline"
        onClick={() => onSelect(section.id)}
      >
        {section.title}
      </button>
      {isStudioAdmin && (
        <button
          type="button"
          className="shrink-0 text-xs text-red-400 hover:underline"
          onClick={() => {
            if (confirm(`Delete section "${section.title}"?`)) {
              onDelete(section.id)
            }
          }}
        >
          Delete
        </button>
      )}
    </div>
  )
}

export function OutlineNav(props: {
  sections: SectionSummary[]
  selectedSectionId: string | null
  isStudioAdmin: boolean
  onSelect: (sectionId: string) => void
  onDelete: (sectionId: string) => void
  onReorder: (orderedIds: string[]) => void
  newTitle: string
  onNewTitleChange: (v: string) => void
  onAddSection: () => void
}): ReactElement {
  const {
    sections,
    selectedSectionId,
    isStudioAdmin,
    onSelect,
    onDelete,
    onReorder,
    newTitle,
    onNewTitleChange,
    onAddSection,
  } = props

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const ids = sections.map((s) => s.id)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) {
      return
    }
    const next = arrayMove(sections, oldIndex, newIndex)
    onReorder(next.map((s) => s.id))
  }

  const listBody =
    isStudioAdmin ? (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {sections.map((section) => (
              <li key={section.id}>
                <SortableRow
                  section={section}
                  selected={selectedSectionId === section.id}
                  isStudioAdmin={isStudioAdmin}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              </li>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    ) : (
      <ul className="space-y-2">
        {sections.map((section) => (
          <li key={section.id}>
            <OutlineRowReadOnly
              section={section}
              selected={selectedSectionId === section.id}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    )

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-zinc-300">Outline</h2>

      {isStudioAdmin && (
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            placeholder="New section title"
            value={newTitle}
            onChange={(e) => onNewTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAddSection()
              }
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
            onClick={() => onAddSection()}
          >
            Add
          </button>
        </div>
      )}

      {listBody}

      {sections.length === 0 && (
        <p className="text-sm text-zinc-500">No sections yet.</p>
      )}
    </div>
  )
}
