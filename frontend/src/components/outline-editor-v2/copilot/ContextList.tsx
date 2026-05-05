import type { ReactElement } from 'react'

export function ContextList(): ReactElement {
  return (
    <div data-testid="context-list-shim" className="hidden" aria-hidden />
  )
}
