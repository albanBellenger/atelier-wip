import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { StudioChatLlmModels } from '../../services/api'

export type StudioChatModelPickerVariant = 'composer' | 'copilot-inline' | 'chat-room'

export function StudioChatModelPicker(props: {
  variant: StudioChatModelPickerVariant
  modelsQ: Pick<
    UseQueryResult<StudioChatLlmModels>,
    'isPending' | 'isError' | 'data'
  >
  options: string[]
  selectedModel: string | null
  onModelChange: (modelId: string) => void
  modelTitle: string
  disabled?: boolean
  ariaLabel?: string
}): ReactElement {
  const {
    variant,
    modelsQ,
    options,
    selectedModel,
    onModelChange,
    modelTitle,
    disabled = false,
    ariaLabel = 'Chat model',
  } = props

  const selectClass =
    variant === 'composer'
      ? 'block max-w-full cursor-pointer appearance-none truncate bg-transparent py-1 pl-0 pr-5 text-[11px] font-semibold text-zinc-100 hover:text-zinc-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/35 disabled:cursor-not-allowed'
      : variant === 'copilot-inline'
        ? 'max-w-full min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent py-0.5 pl-1 pr-4 text-left text-[10px] font-mono font-semibold text-zinc-100 hover:text-zinc-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/35 disabled:cursor-not-allowed'
        : 'block max-w-full cursor-pointer appearance-none truncate rounded border border-zinc-700/80 bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-100 hover:border-zinc-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/35 disabled:cursor-not-allowed'

  if (modelsQ.isPending) {
    const dot =
      variant === 'copilot-inline'
        ? 'inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500'
        : null
    const label = variant === 'copilot-inline' ? '…' : '…'
    if (variant === 'copilot-inline') {
      return (
        <div
          className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/80 py-1 pl-2 pr-2.5 text-[10px]"
          title={modelTitle}
        >
          {dot ? <span className={dot} aria-hidden /> : null}
          <span className="min-w-0 truncate text-zinc-400">{label}</span>
        </div>
      )
    }
    return (
      <span className="truncate text-zinc-500" title={modelTitle}>
        {label}
      </span>
    )
  }

  if (modelsQ.isError || !modelsQ.data) {
    if (variant === 'copilot-inline') {
      return (
        <div
          className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/80 py-1 pl-2 pr-2.5 text-[10px]"
          title={modelTitle}
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
            aria-hidden
          />
          <span className="min-w-0 truncate text-zinc-400">—</span>
        </div>
      )
    }
    return (
      <span className="truncate text-zinc-500" title={modelTitle}>
        —
      </span>
    )
  }

  if (options.length === 0) {
    if (variant === 'copilot-inline') {
      return (
        <div
          className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/80 py-1 pl-2 pr-2.5 text-[10px]"
          title={modelTitle}
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            aria-hidden
          />
          <span className="min-w-0 truncate font-mono text-zinc-400">
            Not configured
          </span>
        </div>
      )
    }
    return (
      <span className="truncate text-zinc-500" title={modelTitle}>
        Not configured
      </span>
    )
  }

  if (options.length === 1) {
    const id = options[0] ?? ''
    if (variant === 'copilot-inline') {
      return (
        <div
          className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/80 py-1 pl-2 pr-2.5 text-[10px]"
          title={modelTitle}
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
            aria-hidden
          />
          <span className="min-w-0 truncate font-mono text-[11px] text-zinc-100">
            {id}
          </span>
        </div>
      )
    }
    return (
      <span
        className={
          variant === 'composer'
            ? 'truncate text-zinc-100'
            : 'truncate font-mono text-xs text-zinc-200'
        }
        title={modelTitle}
      >
        {id}
      </span>
    )
  }

  const wrapClass =
    variant === 'composer'
      ? 'relative flex max-w-[min(240px,55vw)] min-w-0 items-center'
      : variant === 'copilot-inline'
        ? 'relative flex min-w-0 max-w-full flex-1 items-center'
        : 'relative flex min-w-0 max-w-[min(280px,90%)] items-center'

  return (
    <div className={wrapClass}>
      <select
        aria-label={ariaLabel}
        disabled={disabled}
        className={selectClass}
        title={modelTitle}
        value={selectedModel ?? options[0] ?? ''}
        onChange={(e) => onModelChange(e.target.value)}
      >
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] leading-none text-zinc-500 ${
          variant === 'copilot-inline' ? 'pr-0.5' : ''
        }`}
        aria-hidden
      >
        ▾
      </span>
    </div>
  )
}
