import type { ReactElement } from 'react'

export function Dot(props: {
  color: string
  title?: string
  className?: string
}): ReactElement {
  const { color, title, className = '' } = props
  return (
    <span
      title={title}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  )
}
