import type { ReactElement } from 'react'

/** FR §10.3 step 3 — prescribed copy when mandatory context was trimmed after summarisation / truncation. */
export const CONTEXT_TRUNCATION_BANNER_COPY =
  'This section is very large — some content was trimmed from context. Consider splitting this section into smaller parts.'

export function ContextTruncationBanner(props: {
  visible: boolean
  /** When set, a Dismiss control clears the banner until the parent hides it again. */
  onDismiss?: () => void
}): ReactElement | null {
  if (!props.visible) {
    return null
  }
  return (
    <div
      data-testid="context-truncation-banner"
      role="alert"
      className="flex shrink-0 items-start justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200"
    >
      <span className="min-w-0 flex-1 leading-snug">{CONTEXT_TRUNCATION_BANNER_COPY}</span>
      {props.onDismiss ? (
        <button
          type="button"
          className="shrink-0 rounded border border-amber-600/50 px-2 py-0.5 text-[11px] font-medium text-amber-100 hover:bg-amber-900/50"
          onClick={() => {
            props.onDismiss?.()
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}
