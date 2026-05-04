import type { ReactElement } from 'react'

export function CopilotHeader(props: {
  collaboratorCount: number
  newThreadPending: boolean
  onNewThread: () => void
}): ReactElement {
  const { collaboratorCount, newThreadPending, onNewThread } = props
  return (
    <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">
          Private · {collaboratorCount}{' '}
          {collaboratorCount === 1 ? 'collaborator' : 'collaborators'} editing
        </p>
      </div>
      <button
        type="button"
        disabled={newThreadPending}
        className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
        onClick={() => onNewThread()}
      >
        New thread
      </button>
    </div>
  )
}
