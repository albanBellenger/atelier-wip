import type { ReactElement, ReactNode } from 'react'

export function CopilotOverlay(props: {
  open: boolean
  onClose: () => void
  children: ReactNode
}): ReactElement {
  const { open, onClose, children } = props
  if (!open) {
    return <></>
  }
  return (
    <>
      <button
        type="button"
        aria-label="Close copilot backdrop"
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <aside
        id="copilot-overlay-panel"
        data-testid="copilot-overlay"
        className="fixed inset-y-0 right-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-zinc-800/80 bg-[#0a0a0b] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
          <span className="text-sm font-medium text-zinc-200">Copilot</span>
          <button
            type="button"
            data-testid="copilot-close"
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </aside>
    </>
  )
}
