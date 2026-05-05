import type { ReactElement, ReactNode } from 'react'

export function Pill(props: {
  children: ReactNode
  className?: string
  title?: string
}): ReactElement {
  const { children, className = '', title } = props
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2 py-0.5 text-[11px] font-medium text-zinc-300 ${className}`}
    >
      {children}
    </span>
  )
}
