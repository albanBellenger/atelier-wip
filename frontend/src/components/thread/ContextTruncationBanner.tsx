import type { ReactElement } from 'react'

const BANNER_TEXT =
  'This section is very large — some content was trimmed from context. Consider splitting this section into smaller parts.'

export function ContextTruncationBanner(props: {
  visible: boolean
}): ReactElement | null {
  if (!props.visible) {
    return null
  }
  return (
    <div
      data-testid="context-truncation-banner"
      className="shrink-0 border-b border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100"
    >
      {BANNER_TEXT}
    </div>
  )
}
