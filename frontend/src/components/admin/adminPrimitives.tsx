import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

export const ADMIN_CONSOLE_ACCENT = '#8b5cf6'

export function StatLabel({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{children}</div>
  )
}

export function Hairline({ className = '' }: { className?: string }): React.ReactElement {
  return <div className={`h-px w-full bg-zinc-800/80 ${className}`} />
}

export type PillTone = 'zinc' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan'

export function Pill({
  tone = 'zinc',
  children,
  mono,
}: {
  tone?: PillTone
  children: ReactNode
  mono?: boolean
}): React.ReactElement {
  const tones: Record<PillTone, string> = {
    zinc: 'bg-zinc-800/60 text-zinc-300 border-zinc-700/60',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]} ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </span>
  )
}

export type DotTone = 'zinc' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan'

export function Dot({ tone = 'zinc' }: { tone?: DotTone }): React.ReactElement {
  const tones: Record<DotTone, string> = {
    zinc: 'bg-zinc-500',
    violet: 'bg-violet-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    cyan: 'bg-cyan-400',
  }
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${tones[tone]}`} />
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${checked ? 'border-violet-500/40 bg-violet-500/30' : 'border-zinc-700/60 bg-zinc-800/60'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-zinc-100 transition ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
      />
    </button>
  )
}

type BtnTone = 'ghost' | 'quiet' | 'primary' | 'danger'
type BtnSize = 'sm' | 'md' | 'lg'

export function Btn({
  tone = 'ghost',
  size = 'md',
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: BtnTone
  size?: BtnSize
}): React.ReactElement {
  const sizes: Record<BtnSize, string> = {
    sm: 'px-2.5 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-[12px]',
    lg: 'px-3.5 py-2 text-[12px]',
  }
  const tones: Record<BtnTone, string> = {
    ghost: 'border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800',
    quiet: 'text-zinc-400 hover:text-zinc-200',
    primary: 'text-white shadow-sm transition hover:brightness-110',
    danger: 'border border-rose-500/30 bg-rose-500/5 text-rose-300 hover:bg-rose-500/10',
  }
  return (
    <button
      type="button"
      className={`rounded-md font-medium transition ${sizes[size]} ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Currency({ value }: { value: number }): React.ReactElement {
  return <span className="font-mono tabular-nums">${value.toFixed(2)}</span>
}

export function MoneyBar({
  used,
  budget,
  accent,
}: {
  used: number
  budget: number
  accent: string
}): React.ReactElement {
  const pct = budget > 0 ? Math.min(used / budget, 1) : 0
  const fill = pct >= 0.95 ? '#f43f5e' : pct >= 0.75 ? '#f59e0b' : accent
  return (
    <div className="min-w-[160px]">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[12px] tabular-nums text-zinc-200">${used.toFixed(2)}</span>
        <span className="text-[11px] text-zinc-500">/ ${budget}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800/80">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: fill }} />
      </div>
    </div>
  )
}

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="max-w-3xl">
        <h1 className="font-serif text-[34px] font-medium leading-[1.1] tracking-[-0.02em] text-zinc-100">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{subtitle}</p>
        ) : null}
      </div>
      {actions ?? null}
    </div>
  )
}

export function Card({
  title,
  titleHint,
  right,
  children,
}: {
  title: ReactNode
  titleHint?: ReactNode
  right?: ReactNode
  children: ReactNode
}): React.ReactElement {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800/80 px-5 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-200">{title}</h2>
          {titleHint ?? null}
        </div>
        <div>{right}</div>
      </div>
      {children}
    </section>
  )
}

export function Table({ children }: { children: ReactNode }): React.ReactElement {
  return <div>{children}</div>
}

export function THead({
  cols,
  grid,
}: {
  cols: string[]
  grid: string
}): React.ReactElement {
  return (
    <div className={`grid ${grid} items-center gap-3 border-b border-zinc-800/60 px-5 py-2.5`}>
      {cols.map((c) => (
        <span key={c} className="text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
          {c}
        </span>
      ))}
    </div>
  )
}

export function TRow({
  grid,
  children,
}: {
  grid: string
  children: ReactNode
}): React.ReactElement {
  return (
    <div
      className={`grid ${grid} items-center gap-3 border-b border-zinc-800/60 px-5 py-3 last:border-b-0 hover:bg-zinc-900/40`}
    >
      {children}
    </div>
  )
}

export function Avatar({
  initials,
  muted,
}: {
  initials: string
  muted?: boolean
}): React.ReactElement {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-[10px] font-medium ${muted ? 'text-zinc-500' : 'text-zinc-200'}`}
    >
      {initials}
    </span>
  )
}

export function Segmented<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K
  onChange: (next: K) => void
  options: readonly (readonly [K, string])[]
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`rounded px-2.5 py-1 text-[11px] transition ${value === k ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function ProviderGlyph({
  name,
  logoUrl,
}: {
  name: string
  logoUrl?: string | null
}): React.ReactElement {
  const [imgFailed, setImgFailed] = useState(false)
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
  const trimmed = logoUrl?.trim()
  if (trimmed && !imgFailed) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-950">
        <img
          src={trimmed}
          alt=""
          width={28}
          height={28}
          className="h-full w-full object-contain p-0.5"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      </span>
    )
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-zinc-950 font-mono text-[10px] text-zinc-300">
      {initials || '?'}
    </span>
  )
}

export function RouteRule({
  label,
  model,
  fallback,
}: {
  label: string
  model: string
  fallback: string
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-zinc-950/40 px-4 py-3">
      <div className="text-[13px] text-zinc-200">{label}</div>
      <div className="flex items-center gap-2 text-[12px] text-zinc-400">
        <span className="rounded bg-zinc-900 px-2 py-1 font-mono text-zinc-200">{model}</span>
        <span>↳ fallback</span>
        <span className="rounded bg-zinc-900 px-2 py-1 font-mono text-zinc-300">{fallback}</span>
      </div>
    </div>
  )
}

export function PolicyTile({
  title,
  value,
  sub,
}: {
  title: string
  value: string
  sub: string
}): React.ReactElement {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
      <StatLabel>{title}</StatLabel>
      <div className="mt-1 text-[15px] text-zinc-100">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>
    </div>
  )
}

export function KpiTile({
  label,
  value,
  sub,
}: {
  label: string
  value: ReactNode
  sub?: string
}): React.ReactElement {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <StatLabel>{label}</StatLabel>
      <div className="mt-2 font-mono text-[24px] tabular-nums text-zinc-100 lg:text-[26px]">{value}</div>
      {sub != null && sub !== '' ? (
        <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>
      ) : null}
    </div>
  )
}

export function Field({
  label,
  value,
  mono,
  readOnly,
}: {
  label: string
  value: string
  mono?: boolean
  readOnly?: boolean
}): React.ReactElement {
  return (
    <div>
      <StatLabel>{label}</StatLabel>
      <input
        readOnly={readOnly}
        value={value}
        onChange={() => undefined}
        className={`mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none transition focus:border-zinc-600 ${mono ? 'font-mono text-[12px]' : ''} ${readOnly ? 'text-zinc-400' : ''}`}
      />
    </div>
  )
}

export function FieldSelect({
  label,
  value,
  options,
}: {
  label: string
  value: string
  options: string[]
}): React.ReactElement {
  return (
    <div>
      <StatLabel>{label}</StatLabel>
      <select
        defaultValue={value}
        className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}
