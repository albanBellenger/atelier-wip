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
import { useStudioChatModelPicker } from '../../hooks/useStudioChatModelPicker'
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
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import {
  collaboratorCountFromAwareness,
  safeAwarenessStates,
} from '../../lib/copilotAwareness'
import { parseThreadComposerInput } from '../../lib/threadSlashCommand'
import type { LlmOutboundPromptMessage } from '../../lib/llmOutboundPrompt'
import {
  getContextPreview,
  getLlmRuntimeInfo,
  getPrivateThread,
  getWorkOrder,
  improveSection,
  listProjectIssues,
  listWorkOrders,
  resetPrivateThread,
  type SectionHealth,
} from '../../services/api'
import { StudioChatModelPicker } from '../chat/StudioChatModelPicker'
import { ContextTab } from './ContextTab'
import { ContextTruncationBanner } from './ContextTruncationBanner'
import { CopilotComposer } from './CopilotComposer'
import { LlmOutboundPromptOverlay } from '../debug/LlmOutboundPromptOverlay'
import { CopilotHeader } from './CopilotHeader'
import type { CopilotSideTab } from './CopilotStatusStrip'
import { CopilotStatusStrip } from './CopilotStatusStrip'
import { CopilotTabs } from './CopilotTabs'
import { ConversationView } from './ConversationView'
import { CritiqueTab } from './CritiqueTab'
import { DiffTab } from './DiffTab'
import { RecentUpdatesFeed, type RecentUpdateItem } from './RecentUpdatesFeed'
import { SourcesTab } from './SourcesTab'

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
  studioId: string
  projectId: string
  sectionId: string
  projectHref: string
  collab: YjsCollab | null
  editorSelection: EditorSelectionState | null
  onClearEditorSelection: () => void
  density?: CopilotDensity
  onDraftEmptyChange?: (empty: boolean) => void
  /** When set, status strip uses server health metrics instead of client-only heuristics. */
  healthSummary?: SectionHealth | null
  /** When true, context prefs and Sources pin actions are enabled (Studio Owner or Builder). */
  canEditContext?: boolean
  /** Live patch preview for the section editor preview pane (Accept / Reject). */
  onPatchOverlayChange?: (state: SectionPatchOverlayState | null) => void
  /** Synced context preview query (main column Context mode + copilot Context tab). */
  contextRagQuerySynced?: string
  onContextRagQuerySyncedChange?: (q: string) => void
  /** Parent-driven tab switch (e.g. HealthRail “Open … tab”). */
  copilotTabRequest?: { id: number; tab: CopilotSideTab } | null
}): ReactElement {
  const {
    studioId,
    projectId,
    sectionId,
    projectHref,
    collab,
    editorSelection,
    onClearEditorSelection,
    density = 'compact',
    onDraftEmptyChange,
    healthSummary,
    canEditContext = false,
    onPatchOverlayChange,
    contextRagQuerySynced = '',
    onContextRagQuerySyncedChange,
    copilotTabRequest,
  } = props
  const { streamPrivateThread } = useStream()
  const {
    modelsQ,
    options,
    selectedModel,
    setSelectedModel,
    modelTitle,
  } = useStudioChatModelPicker({ studioId })
  const qc = useQueryClient()
  const [sideTab, setSideTab] = useState<CopilotSideTab>('chat')
  const [draft, setDraft] = useState('')
  const [debouncedDraftForPreview, setDebouncedDraftForPreview] = useState('')
  const [proposedMarkdown, setProposedMarkdown] = useState('')
  const [streaming, setStreaming] = useState('')
  const [liveTrimNotice, setLiveTrimNotice] = useState<string | null>(null)
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
  const prevStreamingRef = useRef('')
  const collabRef = useRef<YjsCollab | null>(null)
  const [docBump, setDocBump] = useState(0)
  const [recentAccordionOpen, setRecentAccordionOpen] = useState(false)
  const [llmPromptByMessageId, setLlmPromptByMessageId] = useState<
    Record<string, LlmOutboundPromptMessage[]>
  >({})
  const [llmPromptOverlayMessageId, setLlmPromptOverlayMessageId] = useState<
    string | null
  >(null)

  useEffect(() => {
    onDraftEmptyChange?.(!draft.trim())
  }, [draft, onDraftEmptyChange])

  useEffect(() => {
    const delay = draft.trim().length > 3 ? 600 : 0
    const id = window.setTimeout(() => {
      setDebouncedDraftForPreview(draft.trim().length > 3 ? draft : '')
    }, delay)
    return () => window.clearTimeout(id)
  }, [draft])

  useEffect(() => {
    if (copilotTabRequest == null) {
      return
    }
    setSideTab(copilotTabRequest.tab)
  }, [copilotTabRequest?.id, copilotTabRequest?.tab])

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
  const contextTabRagQuery =
    contextRagQuerySynced.trim() !== '' ? contextRagQuerySynced : draft

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
      setLiveTrimNotice(null)
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
        ...(selectedModel ? { preferred_model: selectedModel } : {}),
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
          if (meta.trim_notice != null && meta.trim_notice !== '') {
            setLiveTrimNotice(meta.trim_notice)
          }
          if (meta.findings !== undefined) {
            setFindings(meta.findings)
          }
          if (meta.context_truncated !== undefined) {
            setContextTruncated(meta.context_truncated === true)
          }
          const raw =
            meta.patch_proposal !== undefined ? meta.patch_proposal : undefined
          if (raw !== undefined) {
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
          }
          if (
            typeof meta.assistant_message_id === 'string' &&
            meta.assistant_message_id !== '' &&
            meta.llm_outbound_messages != null &&
            meta.llm_outbound_messages.length > 0
          ) {
            setLlmPromptByMessageId((prev) => ({
              ...prev,
              [meta.assistant_message_id]: meta.llm_outbound_messages,
            }))
          }
        },
      })
    },
    onSuccess: () => {
      setStreaming('')
      setLiveTrimNotice(null)
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

  const applyPatchRef = useRef(onApplyPatch)
  applyPatchRef.current = onApplyPatch
  const dismissPatchRef = useRef(onDismissPatch)
  dismissPatchRef.current = onDismissPatch

  const patchOverlayPrevRef = useRef<{
    merged: string
    canApply: boolean
    blocked: string | null
  } | null>(null)

  useLayoutEffect(() => {
    if (onPatchOverlayChange == null) {
      return
    }
    if (!collab?.ytext || patchProposal == null || anchorGate == null) {
      patchOverlayPrevRef.current = null
      onPatchOverlayChange(null)
      return
    }
    const merged = previewFromProposal(anchorGate.snapshot, patchProposal)
    const prev = patchOverlayPrevRef.current
    if (
      prev != null &&
      prev.merged === merged &&
      prev.canApply === applyPatchEnabled &&
      prev.blocked === applyPatchBlocked
    ) {
      return
    }
    patchOverlayPrevRef.current = {
      merged,
      canApply: applyPatchEnabled,
      blocked: applyPatchBlocked,
    }
    onPatchOverlayChange({
      mergedMarkdown: merged,
      canApply: applyPatchEnabled,
      blockedReason: applyPatchBlocked,
      onApply: () => {
        applyPatchRef.current()
      },
      onDismiss: () => {
        dismissPatchRef.current()
      },
    })
  }, [
    onPatchOverlayChange,
    collab?.ytext,
    patchProposal,
    anchorGate,
    applyPatchEnabled,
    applyPatchBlocked,
    docBump,
  ])

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
    const wasStreaming = prevStreamingRef.current !== ''
    const isStreaming = streaming !== ''
    prevStreamingRef.current = streaming
    const behavior: ScrollBehavior =
      chatAutoscrollFirstRef.current || isStreaming
        ? 'auto'
        : wasStreaming
          ? 'smooth'
          : 'smooth'
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

  const stripDrift = healthSummary?.drift_count ?? staleWoCount
  const stripGap = healthSummary?.gap_count ?? gapCount
  const stripTokUsed =
    healthSummary?.token_used ?? contextMeterQ.data?.total_tokens ?? null
  const stripTokBudget =
    healthSummary?.token_budget ?? contextMeterQ.data?.budget_tokens ?? null
  const stripSourcesCount =
    healthSummary != null
      ? healthSummary.citations_resolved + healthSummary.citations_missing
      : uniqueKinds

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
      onScopeSection={() => setIncludeSelectionInContext(false)}
      onScopeSelection={() => {
        if (hasNonEmptySelection) {
          setIncludeSelectionInContext(true)
        }
      }}
      variant={isFocusLayout ? 'focus' : 'compact'}
      footerLeading={
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              modelConnection === 'ok'
                ? 'bg-emerald-500'
                : modelConnection === 'warn'
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            title={
              modelConnection === 'ok'
                ? 'LLM runtime reports a default model'
                : modelConnection === 'warn'
                  ? 'LLM default model not set'
                  : 'Could not load LLM runtime info'
            }
            aria-hidden
          />
          <StudioChatModelPicker
            variant="copilot-inline"
            modelsQ={modelsQ}
            options={options}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            modelTitle={modelTitle}
            ariaLabel="Copilot chat model"
          />
        </div>
      }
    />
  )

  const tabPanel =
    sideTab === 'chat' ? (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ContextTruncationBanner
          visible={contextTruncated}
          onDismiss={() => {
            setContextTruncated(false)
          }}
        />
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
                liveTrimNotice={liveTrimNotice}
                threadPending={threadQ.isPending}
                patchProposal={patchProposal}
                patchPreviewLines={patchPreviewLines}
                applyPatchBlocked={applyPatchBlocked}
                applyErr={applyErr}
                applyPatchEnabled={applyPatchEnabled}
                findings={findings}
                err={err}
                bottomRef={bottomRef}
                llmPromptByMessageId={llmPromptByMessageId}
                onOpenLlmPrompt={(id) => setLlmPromptOverlayMessageId(id)}
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
          <div className="relative shrink-0 px-4 pb-4 pt-2">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-b from-transparent to-zinc-900/40"
            />
            {composerEl}
          </div>
        ) : (
          <div className="shrink-0 w-full border-t border-zinc-800/80 bg-[#0a0a0b]">
            {composerEl}
          </div>
        )}
      </div>
    ) : sideTab === 'context' ? (
      <div
        className={
          isFocusLayout
            ? 'mx-auto flex min-h-0 w-full max-w-[840px] flex-1 flex-col overflow-hidden px-4'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
        }
      >
        <ContextTab
          projectId={projectId}
          sectionId={sectionId}
          ragQuery={contextTabRagQuery}
          includeGitHistory={includeGitHistory}
          canEditContext={canEditContext}
          onRagQueryChange={onContextRagQuerySyncedChange}
        />
      </div>
    ) : sideTab === 'sources' ? (
      <div
        className={
          isFocusLayout
            ? 'mx-auto flex min-h-0 w-full max-w-[840px] flex-1 flex-col overflow-hidden px-4'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
        }
      >
        <SourcesTab
          projectId={projectId}
          sectionId={sectionId}
          canEditContext={canEditContext}
        />
      </div>
    ) : sideTab === 'critique' ? (
      isFocusLayout ? (
        <div className="mx-auto flex min-h-0 w-full max-w-[840px] flex-1 flex-col overflow-hidden px-4">
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
      <div className="mx-auto flex min-h-0 w-full max-w-[840px] flex-1 flex-col overflow-hidden px-4">
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

  const llmPromptOverlay = (
    <LlmOutboundPromptOverlay
      open={llmPromptOverlayMessageId != null}
      onClose={() => setLlmPromptOverlayMessageId(null)}
      messages={
        llmPromptOverlayMessageId != null
          ? llmPromptByMessageId[llmPromptOverlayMessageId] ?? []
          : []
      }
    />
  )

  if (isFocusLayout) {
    return (
      <>
        <section className="mx-auto flex h-full min-h-0 w-full max-w-[840px] flex-col overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-900/40">
          <div className="flex shrink-0 items-stretch border-b border-zinc-800/80">
            <CopilotTabs
              sideTab={sideTab}
              onSelectTab={(tab) => setSideTab(tab)}
              critiqueBadge={critiqueBadge}
              diffBadge={diffBadge}
              sourcesBadge={
                healthSummary != null && healthSummary.citations_missing > 0
                  ? healthSummary.citations_missing
                  : null
              }
              variant="inline-overflow"
            />
            <CopilotStatusStrip
              driftCount={stripDrift}
              gapCount={stripGap}
              tokenUsed={stripTokUsed}
              tokenBudget={stripTokBudget}
              sourcesCount={stripSourcesCount}
              onSelectTab={(tab) => setSideTab(tab)}
              variant="inline"
            />
          </div>
          {tabPanel}
        </section>
        {llmPromptOverlay}
      </>
    )
  }

  return (
    <>
      <aside className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-900/60">
        <CopilotHeader
          collaboratorCount={collaboratorCount}
          newThreadPending={resetMut.isPending}
          onNewThread={() => resetMut.mutate()}
        />
        <CopilotStatusStrip
          driftCount={stripDrift}
          gapCount={stripGap}
          tokenUsed={stripTokUsed}
          tokenBudget={stripTokBudget}
          sourcesCount={stripSourcesCount}
          onSelectTab={(tab) => setSideTab(tab)}
        />
        <CopilotTabs
          sideTab={sideTab}
          onSelectTab={(tab) => setSideTab(tab)}
          critiqueBadge={critiqueBadge}
          diffBadge={diffBadge}
          sourcesBadge={
            healthSummary != null && healthSummary.citations_missing > 0
              ? healthSummary.citations_missing
              : null
          }
        />
        {tabPanel}
      </aside>
      {llmPromptOverlay}
    </>
  )
}
