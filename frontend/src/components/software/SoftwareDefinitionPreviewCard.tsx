import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const PREVIEW_MAX_LINES = 5

export type SoftwareDefinitionPreviewCardProps = {
  definition: string | null | undefined
  showEditLink: boolean
  settingsPath: string
  className?: string
}

export function SoftwareDefinitionPreviewCard({
  definition,
  showEditLink,
  settingsPath,
  className = '',
}: SoftwareDefinitionPreviewCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false)

  const { text, totalLines, isEmpty } = useMemo(() => {
    const raw = (definition ?? '').replace(/\r\n/g, '\n')
    const t = raw.trim()
    if (!t) {
      return { text: '', totalLines: 0, isEmpty: true }
    }
    const lines = raw.split('\n')
    const n = lines.length
    return { text: raw, totalLines: n, isEmpty: false }
  }, [definition])

  const displayText = useMemo(() => {
    if (isEmpty) return ''
    if (expanded || totalLines <= PREVIEW_MAX_LINES) return text
    const slice = text.split('\n').slice(0, PREVIEW_MAX_LINES)
    return `${slice.join('\n')}\n…`
  }, [text, expanded, isEmpty, totalLines])

  const showLineToggle = !isEmpty && totalLines > PREVIEW_MAX_LINES

  return (
    <section
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
            Software definition
          </h2>
          <span className="inline-flex shrink-0 rounded-full border border-violet-500/35 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
            system prompt
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[12px]">
          <span className="max-w-[20rem] text-right text-zinc-500">
            Injected into every LLM call in this software
          </span>
          {showEditLink ? (
            <Link
              to={settingsPath}
              className="font-medium text-zinc-300 hover:text-zinc-100"
            >
              Edit
            </Link>
          ) : null}
        </div>
      </div>

      <div className="pt-4">
        {isEmpty ? (
          <p className="text-[13px] text-zinc-500">No software definition yet.</p>
        ) : (
          <>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-zinc-200">
              {displayText}
            </pre>
            {showLineToggle ? (
              <button
                type="button"
                className="mt-3 text-left text-[12px] font-medium text-zinc-500 hover:text-zinc-300"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded
                  ? 'Show less'
                  : `Show all ${totalLines} lines`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
