import type { ReactElement } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { acceptSuggestion, rejectSuggestion } from '../features/outline-editor/blockMutations'
import {
  ACCENTS,
  OE_CONTEXT,
  OE_CRITIQUE,
  OE_DOC,
  OE_MODELS,
  OE_PENDING_DIFFS,
  OE_SECTIONS,
  OE_SLASH,
  OE_SOURCES,
  OE_THREAD,
} from '../features/outline-editor/data'
import { CopilotPanel } from '../features/outline-editor/CopilotPanel'
import {
  CodeView,
  ContextView,
  Preview,
  Split,
} from '../features/outline-editor/EditorModes'
import { HealthDrawer, HealthRail } from '../features/outline-editor/HealthRail'
import { SectionHeader } from '../features/outline-editor/SectionHeader'
import { SectionRail } from '../features/outline-editor/SectionRail'
import { TopBar } from '../features/outline-editor/TopBar'
import type { OeBlock, OeEditorMode, OeHealthKey, OePendingDiff, OeThreadMsg } from '../features/outline-editor/types'
import { useContextState } from '../features/outline-editor/useContextState'

const PRESENCE = [
  { name: 'Alex Rivera', color: '#8b5cf6' },
  { name: 'Sam Chen', color: '#22d3ee' },
]

export function OutlineEditorPage(): ReactElement {
  const accent = ACCENTS.violet
  const [mode, setMode] = useState<OeEditorMode>('split')
  const [focus, setFocus] = useState(false)
  const modeBeforeFocus = useRef<OeEditorMode>('split')
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [healthOpen, setHealthOpen] = useState<OeHealthKey | null>(null)
  const [activeSectionId, setActiveSectionId] = useState(OE_SECTIONS[0]?.id ?? 's1')
  const [blocks, setBlocks] = useState<OeBlock[]>(() => [...OE_DOC.blocks])
  const [thread, setThread] = useState<OeThreadMsg[]>(() => [...OE_THREAD])
  const [pendingDiffs, setPendingDiffs] = useState<OePendingDiff[]>(() => [
    ...OE_PENDING_DIFFS,
  ])

  const ctx = useContextState(OE_CONTEXT)

  const activeSection = useMemo(
    () => OE_SECTIONS.find((s) => s.id === activeSectionId) ?? OE_SECTIONS[0],
    [activeSectionId],
  )

  const onHealthToggle = useCallback((k: OeHealthKey) => {
    setHealthOpen((open) => (open === k ? null : k))
  }, [])

  const onAcceptSuggestion = useCallback((id: string) => {
    setBlocks((b) => acceptSuggestion(b, id))
    setPendingDiffs((d) => d.filter((x) => x.blockId !== id))
  }, [])

  const onRejectSuggestion = useCallback((id: string) => {
    setBlocks((b) => rejectSuggestion(b, id))
    setPendingDiffs((d) => d.filter((x) => x.blockId !== id))
  }, [])

  const onAcceptDiff = useCallback((d: OePendingDiff) => {
    if (d.blockId) setBlocks((b) => acceptSuggestion(b, d.blockId))
    setPendingDiffs((list) => list.filter((x) => x.id !== d.id))
  }, [])

  const onRejectDiff = useCallback((d: OePendingDiff) => {
    if (d.blockId) setBlocks((b) => rejectSuggestion(b, d.blockId))
    setPendingDiffs((list) => list.filter((x) => x.id !== d.id))
  }, [])

  const enterFocus = useCallback(() => {
    modeBeforeFocus.current = mode
    setFocus(true)
    setMode('preview')
  }, [mode])

  const exitFocus = useCallback(() => {
    setFocus(false)
    setMode(modeBeforeFocus.current)
  }, [])

  const effectiveMode: OeEditorMode = focus ? 'preview' : mode

  const onSend = useCallback((t: string) => {
    const uid = `u-${Date.now()}`
    const mid = `m-${Date.now()}`
    setThread((prev) => [
      ...prev,
      { id: uid, role: 'user', text: t },
      {
        id: mid,
        role: 'model',
        text: 'Acknowledged — this is a stub reply for the outline editor shell.',
      },
    ])
  }, [])

  const editor = (() => {
    if (effectiveMode === 'preview') {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Preview
            blocks={blocks}
            accent={accent}
            onAcceptSuggestion={onAcceptSuggestion}
            onRejectSuggestion={onRejectSuggestion}
          />
        </div>
      )
    }
    if (effectiveMode === 'code') {
      return (
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeView blocks={blocks} />
        </div>
      )
    }
    if (effectiveMode === 'context') {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ContextView
            groups={OE_CONTEXT}
            totalTokens={ctx.total}
            budget={6000}
            accent={accent}
            included={ctx.included}
            onToggle={ctx.toggle}
          />
        </div>
      )
    }
    return (
      <Split
        blocks={blocks}
        accent={accent}
        onAcceptSuggestion={onAcceptSuggestion}
        onRejectSuggestion={onRejectSuggestion}
      />
    )
  })()

  return (
    <div className="outline-editor-shell flex h-screen flex-col bg-[#0a0a0b] font-sans text-zinc-100">
      <TopBar accent={accent} presence={PRESENCE} />
      <div className="flex min-h-0 flex-1">
        {!focus ? (
          <SectionRail
            sections={OE_SECTIONS}
            activeId={activeSectionId}
            accent={accent}
            collapsed={railCollapsed}
            onToggleCollapsed={() => setRailCollapsed((c) => !c)}
            onSelect={setActiveSectionId}
          />
        ) : null}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SectionHeader
            title={activeSection?.title ?? 'Section'}
            slug={activeSection?.slug ?? ''}
            collaboratorCount={2}
            accent={accent}
            mode={effectiveMode}
            onModeChange={focus ? () => {} : setMode}
            focus={focus}
            onFocus={enterFocus}
            onExitFocus={exitFocus}
          />
          <HealthRail healthOpen={healthOpen} onToggle={onHealthToggle} />
          <HealthDrawer openKey={healthOpen} onClose={() => setHealthOpen(null)} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{editor}</div>
        </main>
        {!focus ? (
          <CopilotPanel
            thread={thread}
            onSend={onSend}
            critique={OE_CRITIQUE}
            diffs={pendingDiffs}
            onAcceptDiff={onAcceptDiff}
            onRejectDiff={onRejectDiff}
            contextGroups={OE_CONTEXT}
            contextTotal={ctx.total}
            contextBudget={6000}
            contextIncluded={ctx.included}
            onContextToggle={ctx.toggle}
            sources={OE_SOURCES}
            slash={OE_SLASH}
            models={OE_MODELS}
            accent={accent}
          />
        ) : null}
      </div>
    </div>
  )
}
