import type { ReactElement } from 'react'

import type { SectionLayoutMode } from './sectionLayoutMode'

export function EditorBreadcrumbStrip(props: {
  sectionTitle: string
  sectionSlug: string
  savedState: 'saving' | 'saved'
  lineCount: number
  onSwitchMode: (mode: SectionLayoutMode) => void
}): ReactElement {
  const { sectionTitle, sectionSlug, savedState, lineCount, onSwitchMode } =
    props
  return (
    <div
      className="mx-auto mb-4 flex w-full max-w-[920px] items-center justify-between rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-4 py-2 text-xs text-zinc-400"
      data-testid="editor-breadcrumb-strip"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-zinc-300">{sectionTitle}</span>
        <span className="font-mono text-zinc-600">{sectionSlug}</span>
        <span className="text-zinc-600">·</span>
        <span>{savedState === 'saving' ? 'Saving…' : 'Saved'}</span>
        <span className="text-zinc-600">·</span>
        <span>{lineCount} lines</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSwitchMode('split')}
          className="rounded-md px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Open editor →
        </button>
      </div>
    </div>
  )
}
