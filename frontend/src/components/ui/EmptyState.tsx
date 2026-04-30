import type { ReactElement, ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  children?: ReactNode
}

export function EmptyState(props: Props): ReactElement {
  const { title, description, children } = props
  return (
    <div
      className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-8 text-center text-zinc-300"
      data-testid="empty-state"
    >
      <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      ) : null}
      {children ? <div className="mt-4 flex justify-center">{children}</div> : null}
    </div>
  )
}
