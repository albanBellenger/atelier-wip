import type { ReactElement } from 'react'

export interface EditorBlockHandleOnboardingTooltipProps {
  anchorRect: DOMRectReadOnly
}

/** Fixed tooltip anchored below the Milkdown block handle during first-run onboarding. */
export function EditorBlockHandleOnboardingTooltip({
  anchorRect,
}: EditorBlockHandleOnboardingTooltipProps): ReactElement {
  const centerX = anchorRect.left + anchorRect.width / 2
  const top = anchorRect.bottom + 6
  return (
    <div
      role="tooltip"
      data-testid="editor-block-onboarding-tooltip"
      className="pointer-events-none fixed z-[200] max-w-[14rem] rounded-md border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-left text-[11px] leading-snug text-zinc-300 shadow-lg"
      style={{
        left: `${centerX}px`,
        top: `${top}px`,
        transform: 'translateX(-50%)',
      }}
    >
      Drag to reorder, click + to insert
    </div>
  )
}
