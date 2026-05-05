import type { ReactElement, ReactNode } from 'react'

const pillTones: Record<
  string,
  { border: string; text: string; bg: string }
> = {
  zinc: 'border-zinc-700/80 text-zinc-300 bg-zinc-900/50',
  violet: 'border-violet-500/40 text-violet-200 bg-violet-500/10',
  emerald: 'border-emerald-500/40 text-emerald-200 bg-emerald-500/10',
  amber: 'border-amber-500/40 text-amber-200 bg-amber-500/10',
  rose: 'border-rose-500/40 text-rose-200 bg-rose-500/10',
  cyan: 'border-cyan-500/40 text-cyan-200 bg-cyan-500/10',
}

export function Pill(props: {
  tone: keyof typeof pillTones
  children: ReactNode
  mono?: boolean
}): ReactElement {
  const { tone, children, mono } = props
  const cls = pillTones[tone] ?? pillTones.zinc
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 leading-none ${cls} ${
        mono ? 'font-mono text-[10.5px]' : 'text-[10.5px]'
      }`}
    >
      {children}
    </span>
  )
}

export function Dot(props: { tone: 'emerald' | 'zinc' | string }): ReactElement {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-400',
    zinc: 'bg-zinc-500',
    violet: 'bg-violet-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    cyan: 'bg-cyan-400',
  }
  const bg = colors[props.tone] ?? colors.zinc
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${bg}`} />
}

export function StatLabel(props: { children: ReactNode }): ReactElement {
  return (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
      {props.children}
    </span>
  )
}

export function Kbd(props: { children: ReactNode }): ReactElement {
  return (
    <kbd className="rounded border border-zinc-700 bg-zinc-900/80 px-1 py-0.5 font-mono text-[9.5px] text-zinc-300">
      {props.children}
    </kbd>
  )
}

export function BellIcon(props: { size?: number }): ReactElement {
  const s = props.size ?? 18
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-400"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
