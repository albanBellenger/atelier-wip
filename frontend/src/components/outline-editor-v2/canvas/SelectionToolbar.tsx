import type { ReactElement } from 'react'

export function SelectionToolbar(props: {
  visible: boolean
  onDismiss: () => void
  label?: string
}): ReactElement | null {
  if (!props.visible) {
    return null
  }
  return (
    <div
      data-testid="selection-toolbar"
      className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-xl backdrop-blur-sm"
      role="toolbar"
    >
      <span>{props.label ?? 'Selection'}</span>
      <button
        type="button"
        className="rounded px-2 py-0.5 hover:bg-zinc-800"
        onClick={props.onDismiss}
      >
        Close
      </button>
    </div>
  )
}
