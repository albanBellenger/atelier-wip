import type { ReactElement, ReactNode } from 'react'

export function Kbd(props: { children: ReactNode }): ReactElement {
  return (
    <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-px font-mono text-[10px] text-zinc-400">
      {props.children}
    </kbd>
  )
}
