import type { ReactElement } from 'react'

import type { SectionPatchOverlayState } from '../../../lib/sectionPatchOverlay'

export function SuggestionBlock(props: {
  overlay: SectionPatchOverlayState | null
}): ReactElement | null {
  const { overlay } = props
  if (overlay == null) {
    return null
  }
  return (
    <div
      data-testid="ai-suggestion-block"
      className="rounded-lg border border-violet-500/40 bg-violet-950/30 px-3 py-2 text-sm text-zinc-200"
    >
      <p className="font-medium text-violet-200">Suggested edit</p>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400">
        {overlay.mergedMarkdown.slice(0, 2000)}
      </pre>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-testid="suggestion-apply"
          disabled={!overlay.canApply}
          className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          onClick={() => overlay.onApply()}
        >
          Accept
        </button>
        <button
          type="button"
          data-testid="suggestion-dismiss"
          className="rounded-md border border-zinc-600 px-3 py-1 text-xs text-zinc-300"
          onClick={() => overlay.onDismiss()}
        >
          Reject
        </button>
      </div>
      {overlay.blockedReason ? (
        <p className="mt-2 text-xs text-amber-400">{overlay.blockedReason}</p>
      ) : null}
    </div>
  )
}
