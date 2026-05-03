import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { ReactElement } from 'react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as Y from 'yjs'
import type { EditorSelectionState } from '../editor/SplitEditor'
import { useStream } from '../../hooks/useStream'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import { summarizePeerEdit } from '../../lib/copilotPeerEditSummary'
import {
  applyPatchToYtext,
  canApplyPatch,
  isPatchIntentProposal,
  normalizePatchProposal,
  type PatchAnchor,
  type PatchProposalMeta,
} from '../../lib/sectionPatchApply'
import {
  previewAfterAppend,
  previewAfterEdit,
  previewAfterReplace,
  summarizeTextChange,
} from '../../lib/sectionPatchPreview'
import { parseThreadComposerInput } from '../../lib/threadSlashCommand'
import {
  getContextPreview,
  getLlmRuntimeInfo,
  getPrivateThread,
  getWorkOrder,
  improveSection,
  listProjectIssues,
  listWorkOrders,
  resetPrivateThread,
} from '../../services/api'
import { ContextTab } from './ContextTab'
import { ContextTruncationBanner } from './ContextTruncationBanner'
import { CopilotComposer } from './CopilotComposer'
import { CopilotHeader } from './CopilotHeader'
import { CopilotModelStrip } from './CopilotModelStrip'
import type { CopilotSideTab } from './CopilotStatusStrip'
import { CopilotStatusStrip } from './CopilotStatusStrip'
import { CopilotTabs } from './CopilotTabs'
import { ConversationView } from './ConversationView'
import { CritiqueTab } from './CritiqueTab'
import { DiffTab } from './DiffTab'
import { RecentUpdatesFeed, type RecentUpdateItem } from './RecentUpdatesFeed'

/** y-websocket Awareness can throw from getStates() before the conn/doc is ready. */
function safeAwarenessStates(awareness: {
  getStates: () => Map<number, unknown>
}): Map<number, unknown> | null {
  try {
    return awareness.getStates()
  } catch {
    return null
  }
}

function collaboratorCountFromAwareness(collab: YjsCollab | null): number {
  if (collab == null) {
    return 1
  }
  const awareness = collab.awareness as unknown
  if (
    awareness == null ||
    typeof awareness !== 'object' ||
    !('getStates' in awareness) ||
    typeof (awareness as { getStates?: unknown }).getStates !== 'function'
  ) {
    return 1
  }
  const states = safeAwarenessStates(
    awareness as { getStates: () => Map<number, unknown> },
  )
  if (states == null) {
    return 1
  }
  const names = new Set<string>()
  states.forEach((state: unknown) => {
    if (
      state != null &&
      typeof state === 'object' &&
      'user' in state &&
      state.user != null &&
      typeof state.user === 'object' &&
      'name' in state.user &&
      typeof (state.user as { name?: unknown }).name === 'string'
    ) {
      names.add((state.user as { name: string }).name)
    }
  })
  return Math.max(1, names.size)
}

function remoteEditorNamesFromAwareness(collab: YjsCollab): string[] {
  const awareness = collab.awareness as unknown
  if (
    awareness == null ||
    typeof awareness !== 'object' ||
    !('getStates' in awareness) ||
    typeof (awareness as { getStates?: unknown }).getStates !== 'function' ||
    !('clientID' in awareness) ||
    typeof (awareness as { clientID?: unknown }).clientID !== 'number'
  ) {
    return []
  }
  const localId = (awareness as { clientID: number }).clientID
  const states = safeAwarenessStates(
    awareness as { getStates: () => Map<number, unknown> },
  )
  if (states == null) {
    return []
  }
  const names: string[] = []
  states.forEach((state: unknown, clientId: number) => {
    if (clientId === localId) {
      return
    }
    if (
      state != null &&
      typeof state === 'object' &&
      'user' in state &&
      state.user != null &&
      typeof state.user === 'object' &&
      'name' in state.user &&
      typeof (state.user as { name?: unknown }).name === 'string'
    ) {
      names.push((state.user as { name: string }).name)
    }
  })
  return names
}

export type CopilotDensity = 'compact' | 'focus'

export function CopilotPanel(props: {
  projectId: string
  sectionId: string
  projectHref: string
  collab: YjsCollab | null
  editorSelection: EditorSelectionState | null
  onClearEditorSelection: () => void
  density?: CopilotDensity
  sectionTitle?: string
  onDraftEmptyChange?: (empty: boolean) => void
}): ReactElement {
  const {
    projectId,
    sectionId,
    projectHref,
    collab,
    editorSelection,
    onClearEditorSelection,
    density = 'compact',
    sectionTitle = 'Section copilot',
    onDraftEmptyChange,
  } = props
  const { streamPrivateThread } = useStream()
  const qc = useQueryClient()
  const [sideTab, setSideTab] = useState<CopilotSideTab>('chat')
  const [draft, setDraft] = useState('')
  const [debouncedDraftForPreview, setDebouncedDraftForPreview] = useState('')
  const [proposedMarkdown, setProposedMarkdown] = useState('')
  const [streaming, setStreaming] = useState('')
  const [findings, setFindings] = useState<
    { finding_type: string; description: string }[]
  >([])
  const [contextTruncated, setContextTruncated] = useState(false)
  const [includeGitHistory, setIncludeGitHistory] = useState(false)
  const [includeSelectionInContext, setIncludeSelectionInContext] =
    useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [patchProposal, setPatchProposal] = useState<PatchProposalMeta | null>(
    null,
  )
  const [patchPreviewLines, setPatchPreviewLines] = useState<string[]>([])
  const [applyErr, setApplyErr] = useState<string | null>(null)
  const [localPatchEvents, setLocalPatchEvents] = useState<
    { id: string; ts: string; summary: string }[]
  >([])
  const [peerEditEvents, setPeerEditEvents] = useState<
    { id: string; ts: string; summary: string }[]
  >([])
  const [awareBump, setAwareBump] = useState(0)
  const anchorRef = useRef<PatchAnchor | null>(null)
  const [anchorGate, setAnchorGate] = useState<PatchAnchor | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatAutoscrollFirstRef = useRef(true)
  const collabRef = useRef<YjsCollab | null>(null)
  const [docBump, setDocBump] = useState(0)
  const [recentAccordionOpen, setRecentAccordionOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    onDraftEmptyChange?.(!draft.trim())
  }, [draft, onDraftEmptyChange])

  useEffect(() => {
    if (!headerMenuOpen) {
      return
    }
    const onDoc = (e: MouseEvent): void => {
      const el = headerMenuRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setHeaderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [headerMenuOpen])

  useEffect(() => {
    const delay = draft.trim().length > 3 ? 600 : 0
    const id = window.setTimeout(() => {
      setDebouncedDraftForPreview(draft.trim().length > 3 ? draft : '')
    }, delay)
    return () => window.clearTimeout(id)
  }, [draft])

  useEffect(() => {
    if (!collab?.awareness) {
      return
    }
    const a = collab.awareness as {
      on?: (ev: string, fn: () => void) => void
      off?: (ev: string, fn: () => void) => void
    }
    if (typeof a.on !== 'function' || typeof a.off !== 'function') {
      return
    }
    const onChange = (): void => {
      setAwareBump((n) => n + 1)
    }
    a.on('change', onChange)
    return () => {
      if (typeof a.off === 'function') {
        a.off('change', onChange)
      }
    }
  }, [collab?.awareness])

  void awareBump

  collabRef.current = collab

  useEffect(() => {
    const ytext = collab?.ytext
    setPeerEditEvents([])
    if (!ytext) {
      return
    }
    let timer: number | null = null
    let pending = false
    const flush = (): void => {
      timer = null
      if (!pending) {
        return
      }
      pending = false
      const c = collabRef.current
      const names = c != null ? remoteEditorNamesFromAwareness(c) : []
      const ts = new Date().toISOString()
      const summary = summarizePeerEdit(names)
      setPeerEditEvents((prev) =>
        [
          {
            id: `peer-${ts}-${Math.random().toString(36).slice(2, 9)}`,
            ts,
            summary,
          },
          ...prev,
        ].slice(0, 40),
      )
    }
    const onObs = (_event: Y.YTextEvent, transaction: Y.Transaction): void => {
      if (transaction.local) {
        return
      }
      pending = true
      if (timer != null) {
        window.clearTimeout(timer)
      }
      timer = window.setTimeout(flush, 450)
    }
    ytext.observe(onObs)
    return () => {
      if (timer != null) {
        window.clearTimeout(timer)
      }
      ytext.unobserve(onObs)
    }
  }, [collab?.ytext])

  useLayoutEffect(() => {
    if (!collab?.ytext || patchProposal == null) {
      return
    }
    const onObs = (): void => {
      setDocBump((n) => n + 1)
    }
    collab.ytext.observe(onObs)
    return () => {
      collab.ytext.unobserve(onObs)
    }
  }, [collab?.ytext, patchProposal])

  const threadQ = useQuery({
    queryKey: ['privateThread', projectId, sectionId],
    queryFn: () => getPrivateThread(projectId, sectionId),
    enabled: Boolean(projectId && sectionId),
  })

  const llmRtQ = useQuery({
    queryKey: ['auth', 'llmRuntime'],
    queryFn: () => getLlmRuntimeInfo(),
    staleTime: 120_000,
  })

  const issuesQ = useQuery({
    queryKey: ['projectIssues', projectId, sectionId],
    queryFn: () => listProjectIssues(projectId, { sectionId }),
    enabled: Boolean(projectId && sectionId),
  })

  const woSectionQ = useQuery({
    queryKey: ['workOrders', projectId, 'section', sectionId],
    queryFn: () => listWorkOrders(projectId, { section_id: sectionId }),
    enabled: Boolean(projectId && sectionId),
  })

  const woList = woSectionQ.data ?? []
  const woDetailsQueries = useQueries({
    queries: woList.map((wo) => ({
      queryKey: ['workOrder', projectId, wo.id, 'copilot-feed'],
      queryFn: () => getWorkOrder(projectId, wo.id),
      enabled: Boolean(projectId && wo.id && woList.length > 0),
    })),
  })

  const contextMeterQ = useQuery({
    queryKey: [
      'contextPreview',
      'meter',
      projectId,
      sectionId,
      debouncedDraftForPreview,
      includeGitHistory,
    ],
    queryFn: () =>
      getContextPreview(projectId, sectionId, {
        q: debouncedDraftForPreview,
        includeGitHistory,
      }),
    enabled: Boolean(
      projectId && sectionId && debouncedDraftForPreview.length > 3,
    ),
  })

  const resetMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: () => resetPrivateThread(projectId, sectionId),
    onSuccess: () => {
      chatAutoscrollFirstRef.current = true
      void qc.invalidateQueries({
        queryKey: ['privateThread', projectId, sectionId],
      })
    },
  })

  const improveMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: async (instruction: string | null) => {
      const snapshot = collab?.ytext?.toString() ?? ''
      return improveSection(projectId, sectionId, {
        instruction,
        current_section_plaintext:
          snapshot.length > 0 ? snapshot : undefined,
      })
    },
    onMutate: () => {
      setErr(null)
      setIncludeGitHistory(false)
      setIncludeSelectionInContext(true)
    },
    onSuccess: (r) => {
      setDraft('')
      setProposedMarkdown(r.improved_markdown)
      setSideTab('diff')
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'detail' in e
          ? String((e as { detail: unknown }).detail)
          : 'Request failed'
      setErr(msg)
    },
  })

  const sendMut = useMutation({
    meta: { skipGlobalToast: true },
    mutationFn: async () => {
      const rawContent = draft.trim()
      if (!rawContent) {
        return
      }
      const parsed = parseThreadComposerInput(rawContent)
      if (parsed.kind !== 'stream') {
        return
      }
      const content = parsed.content
      const effectiveIntent = parsed.threadIntent
      const streamCommand = parsed.command
      const sendIncludeGit = includeGitHistory
      const sendIncludeSelection = includeSelectionInContext
      setErr(null)
      setApplyErr(null)
      setPatchProposal(null)
      setPatchPreviewLines([])
      anchorRef.current = null
      setAnchorGate(null)
      setDraft('')
      setIncludeGitHistory(false)
      setIncludeSelectionInContext(true)
      setStreaming('')
      setFindings([])
      setContextTruncated(false)
      const snapshot = collab?.ytext?.toString()
      const sel = editorSelection
      const hasNonEmptySelection =
        sel != null &&
        collab != null &&
        snapshot !== undefined &&
        sel.to > sel.from
      const sendSelectionBounds =
        hasNonEmptySelection &&
        (sendIncludeSelection || effectiveIntent === 'replace_selection')
      const payload = {
        content,
        command: streamCommand,
        ...(collab != null ? { current_section_plaintext: snapshot ?? '' } : {}),
        include_git_history: sendIncludeGit,
        include_selection_in_context: sendIncludeSelection,
        thread_intent: effectiveIntent,
        ...(sendSelectionBounds && sel != null
          ? {
              selection_from: sel.from,
              selection_to: sel.to,
              selected_plaintext: sel.text,
            }
          : {}),
      }
      anchorRef.current =
        collab != null && snapshot !== undefined
          ? {
              snapshot,
              selectionFrom:
                hasNonEmptySelection && sel != null ? sel.from : undefined,
              selectionTo:
                hasNonEmptySelection && sel != null ? sel.to : undefined,
            }
          : null
      setAnchorGate(anchorRef.current)
      await streamPrivateThread(projectId, sectionId, payload, {
        onToken: (t: string) => {
          setStreaming((s) => s + t)
        },
        onMeta: (meta) => {
          setFindings(meta.findings ?? [])
          setContextTruncated(Boolean(meta.context_truncated))
          const raw = meta.patch_proposal
          const norm = normalizePatchProposal(raw ?? null)
          setPatchProposal(norm)
          if (norm && collab != null && snapshot !== undefined) {
            const after = previewFromProposal(snapshot, norm)
            setPatchPreviewLines(
              summarizeTextChange(snapshot, after, 12),
            )
          } else {
            setPatchPreviewLines([])
          }
        },
      })
    },
    onSuccess: () => {
      setStreaming('')
      void qc.invalidateQueries({
        queryKey: ['privateThread', projectId, sectionId],
      })
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'detail' in e
          ? String((e as { detail: unknown }).detail)
          : 'Request failed'
      setErr(msg)
    },
  })

  function previewFromProposal(
    snapshot: string,
    p: PatchProposalMeta,
  ): string {
    if ('error' in p && p.error) {
      return snapshot
    }
    if (!isPatchIntentProposal(p)) {
      return snapshot
    }
    if (p.intent === 'append') {
      return previewAfterAppend(snapshot, p.markdown_to_append)
    }
    if (p.intent === 'replace_selection') {
      return previewAfterReplace(
        snapshot,
        p.selection_from,
        p.selection_to,
        p.replacement_markdown,
      )
    }
    if (p.intent === 'edit') {
      return previewAfterEdit(snapshot, p.old_snippet, p.new_snippet)
    }
    return snapshot
  }

  function onApplyPatch(): void {
    setApplyErr(null)
    if (!collab?.ytext || !patchProposal || !anchorRef.current) {
      setApplyErr('Nothing to apply.')
      return
    }
    const anchor: PatchAnchor = {
      snapshot: anchorRef.current.snapshot,
      selectionFrom: anchorRef.current.selectionFrom,
      selectionTo: anchorRef.current.selectionTo,
    }
    const r = applyPatchToYtext(collab.ytext, patchProposal, anchor)
    if (!r.ok) {
      setApplyErr(r.reason)
      return
    }
    const summary =
      patchPreviewLines.length > 0
        ? `LLM patch · ${patchPreviewLines[0].slice(0, 80)}`
        : 'LLM patch applied'
    setLocalPatchEvents((prev) => [
      {
        id: `llm-${Date.now()}`,
        ts: new Date().toISOString(),
        summary,
      },
      ...prev,
    ].slice(0, 40))
    setPatchProposal(null)
    setPatchPreviewLines([])
    anchorRef.current = null
    setAnchorGate(null)
  }

  function onDismissPatch(): void {
    setPatchProposal(null)
    setPatchPreviewLines([])
    anchorRef.current = null
    setAnchorGate(null)
    setApplyErr(null)
  }

  function onViewPatchDiff(): void {
    if (!patchProposal || !anchorRef.current?.snapshot) {
      return
    }
    const merged = previewFromProposal(anchorRef.current.snapshot, patchProposal)
    setProposedMarkdown(merged)
    setSideTab('diff')
  }

  function onApplyProposedFull(): void {
    if (!collab?.ytext || !proposedMarkdown.trim()) {
      return
    }
    const t = collab.ytext
    t.delete(0, t.length)
    t.insert(0, proposedMarkdown)
    setProposedMarkdown('')
    setSideTab('chat')
  }

  function handleSend(): void {
    const raw = draft.trim()
    if (!raw || sendMut.isPending || improveMut.isPending) {
      return
    }
    const parsed = parseThreadComposerInput(raw)
    if (parsed.kind === 'improve_section') {
      improveMut.mutate(parsed.instruction)
      return
    }
    sendMut.mutate()
  }

  const msgs = threadQ.data?.messages ?? []
  const parsedDraft = useMemo(() => parseThreadComposerInput(draft), [draft])
  const selChars =
    editorSelection != null ? editorSelection.to - editorSelection.from : 0
  const hasNonEmptySelection =
    editorSelection != null && editorSelection.to > editorSelection.from
  const replaceNeedsSelection =
    parsedDraft.kind === 'stream' &&
    parsedDraft.threadIntent === 'replace_selection' &&
    !hasNonEmptySelection
  const replaceBlockedFocus =
    density === 'focus' &&
    parsedDraft.kind === 'stream' &&
    parsedDraft.threadIntent === 'replace_selection'
  const replaceBlocked = replaceNeedsSelection || replaceBlockedFocus
  const replaceBlockedReasonMsg = replaceBlockedFocus
    ? 'Switch to Split mode to use /replace with a selection.'
    : 'Replace requires a non-empty editor selection.'
  void docBump
  let applyPatchBlocked: string | null = null
  if (
    patchProposal != null &&
    collab?.ytext != null &&
    anchorGate != null &&
    !('error' in patchProposal && patchProposal.error)
  ) {
    const gate = canApplyPatch(collab.ytext, patchProposal, anchorGate)
    if (!gate.ok) {
      applyPatchBlocked = gate.reason
    }
  }

  const applyPatchEnabled =
    Boolean(collab?.ytext) &&
    patchProposal != null &&
    !('error' in patchProposal && patchProposal.error) &&
    applyPatchBlocked == null

  const staleWoCount =
    woSectionQ.data?.filter((w) => w.is_stale).length ?? 0
  const gapCount = findings.filter((f) => f.finding_type === 'gap').length

  const driftNotesForFeed: RecentUpdateItem[] = useMemo(() => {
    const rows: RecentUpdateItem[] = []
    for (const q of woDetailsQueries) {
      const d = q.data
      if (d == null) {
        continue
      }
      for (const n of d.notes ?? []) {
        if (n.source === 'drift_flag') {
          rows.push({
            id: `drift-${d.id}-${n.id}`,
            kind: 'drift',
            ts: n.created_at,
            workOrderTitle: d.title,
            workOrderId: d.id,
            reason: n.content,
          })
        }
      }
    }
    return rows
  }, [woDetailsQueries])

  const recentFeedItems: RecentUpdateItem[] = useMemo(() => {
    const llm: RecentUpdateItem[] = localPatchEvents.map((e) => ({
      id: e.id,
      kind: 'llm_patch' as const,
      ts: e.ts,
      summary: e.summary,
    }))
    const peer: RecentUpdateItem[] = peerEditEvents.map((e) => ({
      id: e.id,
      kind: 'peer_edit' as const,
      ts: e.ts,
      summary: e.summary,
    }))
    const merged = [...llm, ...peer, ...driftNotesForFeed]
    merged.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    return merged.slice(0, 20)
  }, [localPatchEvents, peerEditEvents, driftNotesForFeed])

  useLayoutEffect(() => {
    if (sideTab !== 'chat') {
      return
    }
    const anchor = bottomRef.current
    if (anchor == null) {
      return
    }
    const behavior = chatAutoscrollFirstRef.current ? 'auto' : 'smooth'
    chatAutoscrollFirstRef.current = false
    anchor.scrollIntoView({ block: 'end', behavior })
  }, [
    sideTab,
    msgs.length,
    streaming,
    threadQ.isFetched,
    recentFeedItems.length,
  ])

  const collaboratorCount = collaboratorCountFromAwareness(collab)

  const critiqueBadge =
    (issuesQ.data?.length ?? 0) + staleWoCount > 0
      ? (issuesQ.data?.length ?? 0) + staleWoCount
      : null
  const diffBadge = proposedMarkdown.trim() ? 1 : null

  const meterBlocks = contextMeterQ.data?.blocks
  const uniqueKinds =
    Array.isArray(meterBlocks) && meterBlocks.length > 0
      ? new Set(meterBlocks.map((b) => b.kind)).size
      : null

  const modelDisplayLine = useMemo(() => {
    if (llmRtQ.isError) {
      return 'Could not load model info'
    }
    const p = (llmRtQ.data?.llm_provider ?? '').trim()
    const m = (llmRtQ.data?.llm_model ?? '').trim()
    if (p && m) {
      return `${p} · ${m}`
    }
    if (m) {
      return m
    }
    if (p) {
      return `${p} (model not set)`
    }
    return 'LLM not configured'
  }, [llmRtQ.data, llmRtQ.isError])

  const modelConnection: 'ok' | 'warn' | 'error' = llmRtQ.isError
    ? 'error'
    : (llmRtQ.data?.llm_model ?? '').trim()
      ? 'ok'
      : 'warn'

  const isFocusLayout = density === 'focus'
  const peerFeedCount = recentFeedItems.filter(
    (i) => i.kind === 'peer_edit',
  ).length
  const driftFeedCount = recentFeedItems.filter(
    (i) => i.kind === 'drift',
  ).length
  const recentFeedAccordionSummary =
    recentFeedItems.length === 0
      ? ''
      : peerFeedCount + driftFeedCount > 0
        ? `${peerFeedCount} peer edits, ${driftFeedCount} drift in last 5 min — show`
        : `${recentFeedItems.length} recent updates — show`

  const composerEl = (
    <CopilotComposer
      draft={draft}
      canSend
      sending={sendMut.isPending}
      improving={improveMut.isPending}
      replaceBlocked={replaceBlocked}
      replaceBlockedReason={replaceBlockedReasonMsg}
      includeSelectionInContext={includeSelectionInContext}
      includeGitHistory={includeGitHistory}
      selectionChars={selChars}
      hasSelection={hasNonEmptySelection}
      onDraftChange={setDraft}
      onSend={() => handleSend()}
      onClearEditorSelection={onClearEditorSelection}
      onToggleSelection={() => setIncludeSelectionInContext((v) => !v)}
      onToggleGitHistory={() => setIncludeGitHistory((v) => !v)}
      onInsertSlash={(prefix) => setDraft(prefix)}
      variant={isFocusLayout ? 'focus' : 'compact'}
      footerLeading={
        <CopilotModelStrip
          variant="inline"
          displayLine={modelDisplayLine}
          connection={modelConnection}
          scopeBadge="Tool default"
        />
      }
    />
  )

  const tabPanel =
    sideTab === 'chat' ? (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ContextTruncationBanner visible={contextTruncated} />
        <div
          ref={chatScrollRef}
          className={
            isFocusLayout
              ? 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]'
              : 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4'
          }
        >
          <div
            className={
              isFocusLayout
                ? 'mx-auto flex min-h-full min-w-0 max-w-[760px] flex-col px-6 py-8'
                : 'flex min-h-full min-w-0 flex-col gap-4'
            }
          >
            {isFocusLayout && recentFeedItems.length > 0 ? (
              <div className="mb-4 shrink-0">
                <button
                  type="button"
                  className="w-full rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-900"
                  onClick={() => setRecentAccordionOpen((o) => !o)}
                >
                  {recentAccordionOpen ? 'Hide recent activity' : recentFeedAccordionSummary}
                </button>
                {recentAccordionOpen ? (
                  <div className="mt-2">
                    <RecentUpdatesFeed
                      items={recentFeedItems}
                      driftInteractive
                      onDriftClick={() => setSideTab('critique')}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {!isFocusLayout ? (
              <div className="shrink-0">
                <RecentUpdatesFeed
                  items={recentFeedItems}
                  driftInteractive
                  onDriftClick={() => setSideTab('critique')}
                />
              </div>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ConversationView
                messages={msgs}
                streaming={streaming}
                threadPending={threadQ.isPending}
                patchProposal={patchProposal}
                patchPreviewLines={patchPreviewLines}
                applyPatchBlocked={applyPatchBlocked}
                applyErr={applyErr}
                applyPatchEnabled={applyPatchEnabled}
                findings={findings}
                err={err}
                bottomRef={bottomRef}
                onApplyPatch={() => onApplyPatch()}
                onDismissPatch={() => onDismissPatch()}
                onViewPatchDiff={() => onViewPatchDiff()}
                density={isFocusLayout ? 'focus' : 'compact'}
                onInsertSlash={isFocusLayout ? (p) => setDraft(p) : undefined}
              />
            </div>
          </div>
        </div>
        {isFocusLayout ? (
          <div className="shrink-0 bg-[#0a0a0b]/80 px-4 pb-4 pt-2">
            {composerEl}
          </div>
        ) : (
          <div className="shrink-0 border-t border-zinc-800/70 bg-zinc-900/95">
            {composerEl}
          </div>
        )}
      </div>
    ) : sideTab === 'context' ? (
      <div
        className={
          isFocusLayout
            ? 'mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col overflow-hidden px-4'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
        }
      >
        <ContextTab
          projectId={projectId}
          sectionId={sectionId}
          ragQuery={draft}
          includeGitHistory={includeGitHistory}
        />
      </div>
    ) : sideTab === 'critique' ? (
      isFocusLayout ? (
        <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col overflow-hidden px-4">
          <CritiqueTab
            projectId={projectId}
            sectionId={sectionId}
            projectHref={projectHref}
          />
        </div>
      ) : (
        <CritiqueTab
          projectId={projectId}
          sectionId={sectionId}
          projectHref={projectHref}
        />
      )
    ) : isFocusLayout ? (
      <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col overflow-hidden px-4">
        <DiffTab
          original={collab?.ytext?.toString() ?? ''}
          proposed={proposedMarkdown}
          onApply={onApplyProposedFull}
        />
      </div>
    ) : (
      <DiffTab
        original={collab?.ytext?.toString() ?? ''}
        proposed={proposedMarkdown}
        onApply={onApplyProposedFull}
      />
    );

  if (isFocusLayout) {
    return (
      <section className="mx-auto flex h-[calc(100vh-200px)] min-h-[560px] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/40">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3">
          <h2 className="min-w-0 truncate text-sm font-medium text-zinc-200">
            {sectionTitle}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="text-zinc-500"
              title={`Private · ${collaboratorCount} collaborator${
                collaboratorCount === 1 ? '' : 's'
              } editing`}
            >
              👥
            </span>
            <button
              type="button"
              disabled={resetMut.isPending}
              className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              onClick={() => resetMut.mutate()}
            >
              New thread
            </button>
            <div className="relative" ref={headerMenuRef}>
              <button
                type="button"
                className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                aria-expanded={headerMenuOpen}
                onClick={() => setHeaderMenuOpen((o) => !o)}
              >
                ⋯
              </button>
              {headerMenuOpen ? (
                <div className="absolute right-0 z-30 mt-1 min-w-[11rem] rounded-md border border-zinc-800 bg-zinc-950 py-1 shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                    onClick={() => {
                      resetMut.mutate()
                      setHeaderMenuOpen(false)
                    }}
                  >
                    Reset thread
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className="block w-full px-3 py-1.5 text-left text-xs text-zinc-600"
                  >
                    Toggle live updates
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-stretch border-b border-zinc-800/80">
          <CopilotTabs
            sideTab={sideTab}
            onSelectTab={(tab) => setSideTab(tab)}
            critiqueBadge={critiqueBadge}
            diffBadge={diffBadge}
            variant="inline-overflow"
          />
          <CopilotStatusStrip
            driftCount={staleWoCount}
            gapCount={gapCount}
            tokenUsed={contextMeterQ.data?.total_tokens ?? null}
            tokenBudget={contextMeterQ.data?.budget_tokens ?? null}
            sourcesCount={uniqueKinds}
            onSelectTab={(tab) => setSideTab(tab)}
            variant="inline"
          />
        </div>
        {tabPanel}
      </section>
    )
  }

  return (
    <aside className="flex h-[min(80vh,720px)] min-h-0 max-w-[420px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <CopilotHeader
        collaboratorCount={collaboratorCount}
        newThreadPending={resetMut.isPending}
        onNewThread={() => resetMut.mutate()}
      />
      <CopilotStatusStrip
        driftCount={staleWoCount}
        gapCount={gapCount}
        tokenUsed={contextMeterQ.data?.total_tokens ?? null}
        tokenBudget={contextMeterQ.data?.budget_tokens ?? null}
        sourcesCount={uniqueKinds}
        onSelectTab={(tab) => setSideTab(tab)}
      />
      <CopilotTabs
        sideTab={sideTab}
        onSelectTab={(tab) => setSideTab(tab)}
        critiqueBadge={critiqueBadge}
        diffBadge={diffBadge}
      />
      {tabPanel}
    </aside>
  )
}
