import type { ReactElement } from 'react'

import { Pill } from '../atoms/Pill'

export function StatusBar(props: {
  driftCount: number
  gapCount: number
  tokenUsed: number
  tokenBudget: number
  citationsResolved: number
  citationsMissing: number
  wordCount: number
  filename: string
  rawMode: boolean
  onSetRawDefault: (raw: boolean) => void
  onTokenClick?: () => void
}): ReactElement {
  const {
    driftCount,
    gapCount,
    tokenUsed,
    tokenBudget,
    citationsResolved,
    citationsMissing,
    wordCount,
    filename,
    rawMode,
    onSetRawDefault,
    onTokenClick,
  } = props

  return (
    <footer
      data-testid="outline-status-bar"
      className="flex shrink-0 flex-wrap items-center gap-2 border-t border-zinc-800/80 bg-[#0b0b0d] px-3 py-2 text-[11px] text-zinc-400"
    >
      <span className="font-mono text-zinc-500">{filename}</span>
      <span className="text-zinc-700" aria-hidden>
        ·
      </span>
      <span>Drift {driftCount}</span>
      <span>Gaps {gapCount}</span>
      <button
        type="button"
        data-testid="status-token-pill"
        onClick={onTokenClick}
        className="rounded px-1 hover:bg-zinc-800 hover:text-zinc-200"
      >
        Tokens {tokenUsed.toLocaleString()} / {tokenBudget.toLocaleString()}
      </button>
      <span>
        Cited {citationsResolved} · Missing {citationsMissing}
      </span>
      <span>Words {wordCount.toLocaleString()}</span>
      <span className="flex-1" />
      <div className="flex items-center gap-1">
        <Pill>
          <button
            type="button"
            data-testid="status-raw-toggle"
            className={
              rawMode
                ? 'text-violet-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }
            onClick={() => {
              onSetRawDefault(true)
            }}
          >
            RAW
          </button>
          <span className="mx-1 text-zinc-600">/</span>
          <button
            type="button"
            data-testid="status-wysiwyg-toggle"
            className={
              !rawMode
                ? 'text-violet-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }
            onClick={() => {
              onSetRawDefault(false)
            }}
          >
            WYSIWYG
          </button>
        </Pill>
      </div>
    </footer>
  )
}
