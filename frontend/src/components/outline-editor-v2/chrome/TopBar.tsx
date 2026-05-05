import type { ReactElement } from 'react'

export function TopBar(props: {
  title: string
  slug: string
  trailing?: ReactElement | null
}): ReactElement {
  const { title, slug, trailing } = props
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#08080a]/90 px-4 py-3 backdrop-blur-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="truncate font-display text-lg font-medium tracking-tight text-zinc-100">
          {title}
        </h1>
        <span className="font-mono text-[11px] text-zinc-500">{slug}</span>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  )
}
