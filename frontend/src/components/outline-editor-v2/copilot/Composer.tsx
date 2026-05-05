import type { ReactElement } from 'react'

/** Shim marker — section copilot composer is owned by CopilotPanel. */
export function Composer(): ReactElement {
  return (
    <div data-testid="composer-shim" className="hidden" aria-hidden />
  )
}
