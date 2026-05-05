import type { ReactElement } from 'react'

import type { Annotation } from '../annotations/useAnnotations'
import { ANN_GLYPH, ANN_HEX } from '../tokens'

export function MarginDot(props: {
  annotations: Annotation[] | undefined
  onOpen?: () => void
}): ReactElement {
  const list = props.annotations ?? []
  return (
    <div
      data-testid="margin-dot"
      className="flex min-h-[1.25rem] flex-col items-center gap-1 pt-1"
      onClick={props.onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          props.onOpen?.()
        }
      }}
      role={props.onOpen ? 'button' : undefined}
      tabIndex={props.onOpen ? 0 : undefined}
    >
      {list.map((a) => (
        <span
          key={a.id}
          title={a.detail ?? a.label}
          className="font-mono text-[12px] leading-none text-zinc-500"
          style={{ color: ANN_HEX[a.kind] ?? '#a1a1aa' }}
        >
          {ANN_GLYPH[a.kind] ?? '•'}
        </span>
      ))}
    </div>
  )
}
