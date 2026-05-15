import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { CollaboratorPresenceStack } from '../components/editor/CollaboratorPresenceStack'
import type { CrepeEditorApi } from '../components/editor/CrepeEditor'
import {
  SplitEditor,
  type EditorSelectionState,
} from '../components/editor/SplitEditor'
import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { HealthRail } from '../components/section/HealthRail'
import { SectionLayoutSwitcher } from '../components/section/SectionLayoutSwitcher'
import { SectionRail } from '../components/section/SectionRail'
import { ContextTab } from '../components/thread/ContextTab'
import type { CopilotSideTab } from '../components/thread/CopilotStatusStrip'
import { ThreadPanel } from '../components/thread/ThreadPanel'
import { usePersistedSectionLayoutMode } from '../hooks/usePersistedSectionLayoutMode'
import { useCollabAwarenessPresence } from '../hooks/useCollabAwarenessPresence'
import { colorsForUser, useYjsCollab } from '../hooks/useYjsCollab'
import { useStudioAccess } from '../hooks/useStudioAccess'
import type { SectionPatchOverlayState } from '../lib/sectionPatchOverlay'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { APP_VERSION } from '../version'
import {
  createSection,
  getProject,
  getSection,
  getSectionHealth,
  getSoftware,
  listProjects,
  listSections,
  listSoftware,
  logout as logoutApi,
  me,
  reorderSections,
  resetPrivateThread,
} from '../services/api'

const SAVE_SAVED_RESET_MS = 2500

/** Section deep-link with collaborative Markdown editor (V1 layout). */
export function SectionPageV1(): ReactElement {
  const { studioId, softwareId, projectId, sectionId } = useParams<{
    studioId: string
    softwareId: string
    projectId: string
    sectionId: string
  }>()
  const navigate = useNavigate()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const pid = projectId ?? ''
  const secid = sectionId ?? ''

  const hostedEnv = useMemo(() => getHostedEnvironment(), [])
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)

  const {
    data: profile,
    isPending: profilePending,
    isError: profileError,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileError, navigate])

  const access = useStudioAccess(profile, sid, sfid)

  const sectionQ = useQuery({
    queryKey: ['section', pid, secid],
    queryFn: () => getSection(pid, secid),
    enabled: Boolean(pid && secid && access.isMember),
  })

  const sectionsListQ = useQuery({
    queryKey: ['sections', pid, 'outlineHealth'],
    queryFn: () => listSections(pid, { includeOutlineHealth: true }),
    enabled: Boolean(pid && access.isMember),
  })

  const sectionHealthQ = useQuery({
    queryKey: ['sectionHealth', pid, secid],
    queryFn: () => getSectionHealth(pid, secid),
    enabled: Boolean(pid && secid && access.isMember),
  })

  const swQ = useQuery({
    queryKey: ['softwareOne', sid, sfid],
    queryFn: () => getSoftware(sid, sfid),
    enabled: Boolean(sid && sfid && access.isMember),
  })

  const studioSoftwareListQ = useQuery({
    queryKey: ['software', sid],
    queryFn: () => listSoftware(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const softwareProjectsNavQ = useQuery({
    queryKey: ['projects', sfid, 'breadcrumb'],
    queryFn: () => listProjects(sfid),
    enabled: Boolean(sfid && access.isMember),
  })

  const projectQ = useQuery({
    queryKey: ['project', sfid, pid],
    queryFn: () => getProject(sfid, pid),
    enabled: Boolean(sfid && pid && access.isMember),
  })

  const headerTrailingCrumb = useMemo(() => {
    if (!swQ.data || !projectQ.data) {
      return undefined
    }
    const swRows = studioSoftwareListQ.data ?? []
    const projRows = (softwareProjectsNavQ.data ?? []).filter((p) => !p.archived)
    const baseLabel = swQ.data.name
    return {
      label: baseLabel,
      softwareId: sfid,
      projectLabel: projectQ.data.name,
      softwareSwitcher:
        swRows.length > 1
          ? {
              currentSoftwareId: sfid,
              softwareOptions: swRows.map((r) => ({ id: r.id, name: r.name })),
              onSoftwareSelect: (nextId: string) => {
                void navigate(`/studios/${sid}/software/${nextId}`)
              },
            }
          : undefined,
      projectSwitcher:
        projRows.length > 1
          ? {
              currentProjectId: pid,
              projectOptions: projRows.map((p) => ({ id: p.id, name: p.name })),
              onProjectSelect: (nextId: string) => {
                void navigate(
                  `/studios/${sid}/software/${sfid}/projects/${nextId}`,
                )
              },
            }
          : undefined,
    }
  }, [
    swQ.data,
    projectQ.data,
    studioSoftwareListQ.data,
    softwareProjectsNavQ.data,
    sfid,
    sid,
    pid,
    navigate,
  ])

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

  const handleStudioChange = useCallback(
    (nextStudioId: string) => {
      void navigate(`/studios/${nextStudioId}`)
    },
    [navigate],
  )

  const collabUser = useMemo(() => {
    if (!profile?.user) return null
    const { color, colorLight } = colorsForUser(profile.user.id)
    return {
      name: profile.user.display_name,
      color,
      colorLight,
      userId: profile.user.id,
    }
  }, [profile?.user?.display_name, profile?.user?.id])

  const collab = useYjsCollab(
    sectionQ.data ? pid : undefined,
    sectionQ.data ? secid : undefined,
    collabUser,
  )

  const sectionEditorApiRef = useRef<CrepeEditorApi | null>(null)
  const copilotSetDraftRef = useRef<((value: string) => void) | null>(null)
  const copilotSlashExecutorRef = useRef<
    ((raw: string) => void | Promise<void>) | null
  >(null)

  const onRegisterCopilotDraftSetter = useCallback(
    (fn: (value: string) => void) => {
      copilotSetDraftRef.current = fn
    },
    [],
  )

  const onRegisterCopilotSlashExecutor = useCallback(
    (run: (raw: string) => void | Promise<void>) => {
      copilotSlashExecutorRef.current = run
    },
    [],
  )

  const onAiComposerPrefill = useCallback((markdown: string) => {
    copilotSetDraftRef.current?.(markdown)
  }, [])

  const onCopilotSlashExecute = useCallback((raw: string) => {
    void copilotSlashExecutorRef.current?.(raw)
  }, [])

  const [editorSelection, setEditorSelection] = useState<
    EditorSelectionState | null
  >(null)

  const onEditorSelectionChange = useCallback(
    (sel: EditorSelectionState | null) => {
      setEditorSelection(sel)
    },
    [],
  )

  const [layoutMode, setLayoutMode] = usePersistedSectionLayoutMode(secid)
  const prevNonFocusRef = useRef<'markdown' | 'preview' | 'split' | 'context'>(
    'split',
  )
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [healthOpen, setHealthOpen] = useState<
    'drift' | 'gap' | 'tok' | 'src' | null
  >(null)
  const [patchOverlay, setPatchOverlay] =
    useState<SectionPatchOverlayState | null>(null)
  const [syncedContextRagQuery, setSyncedContextRagQuery] = useState('')
  const copilotTabReqIdRef = useRef(0)
  const [copilotTabRequest, setCopilotTabRequest] = useState<{
    id: number
    tab: CopilotSideTab
  } | null>(null)

  const requestCopilotTab = useCallback((tab: CopilotSideTab) => {
    copilotTabReqIdRef.current += 1
    setCopilotTabRequest({ id: copilotTabReqIdRef.current, tab })
  }, [])
  const handlePatchOverlay = useCallback(
    (next: SectionPatchOverlayState | null) => {
      setPatchOverlay((prev) => {
        if (next == null) {
          return prev == null ? prev : null
        }
        if (prev == null) {
          return next
        }
        if (
          prev.mergedMarkdown === next.mergedMarkdown &&
          prev.canApply === next.canApply &&
          prev.blockedReason === next.blockedReason
        ) {
          return prev
        }
        return next
      })
    },
    [],
  )
  const [focusComposerEmpty, setFocusComposerEmpty] = useState(true)
  const [breadcrumbSaveState, setBreadcrumbSaveState] = useState<
    'saving' | 'saved'
  >('saved')
  const breadcrumbSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const [breadcrumbDocEpoch, setBreadcrumbDocEpoch] = useState(0)

  useEffect(() => {
    if (layoutMode !== 'focus') {
      prevNonFocusRef.current = layoutMode
    }
  }, [layoutMode])

  useEffect(() => {
    setSyncedContextRagQuery('')
  }, [secid])

  useEffect(() => {
    if (layoutMode === 'focus') {
      setEditorSelection(null)
    }
  }, [layoutMode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setLayoutMode((m) => (m === 'focus' ? prevNonFocusRef.current : 'focus'))
        return
      }
      if (e.key === 'Escape' && layoutMode === 'focus' && focusComposerEmpty) {
        e.preventDefault()
        setLayoutMode('split')
        return
      }
      const tgt = e.target
      if (
        tgt instanceof HTMLElement &&
        (tgt.tagName === 'TEXTAREA' || tgt.tagName === 'INPUT')
      ) {
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault()
        setLayoutMode('markdown')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault()
        setLayoutMode('preview')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault()
        setLayoutMode('split')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '4') {
        e.preventDefault()
        setLayoutMode('focus')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '5') {
        e.preventDefault()
        setLayoutMode('context')
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layoutMode, focusComposerEmpty])

  useEffect(() => {
    const p = collab?.provider as
      | {
          on?: (e: 'sync', fn: (s: boolean) => void) => void
          off?: (e: 'sync', fn: (s: boolean) => void) => void
        }
      | undefined
    if (p == null || typeof p.on !== 'function') {
      return
    }
    const onSync = (isSynced: boolean): void => {
      if (isSynced) {
        setBreadcrumbSaveState('saved')
      }
    }
    p.on('sync', onSync)
    return () => p.off?.('sync', onSync)
  }, [collab])

  useEffect(() => {
    if (!collab) {
      return
    }
    const ydoc = collab.ydoc
    const onY = (): void => {
      setBreadcrumbDocEpoch((n) => n + 1)
      if (breadcrumbSaveTimerRef.current) {
        clearTimeout(breadcrumbSaveTimerRef.current)
        breadcrumbSaveTimerRef.current = null
      }
      setBreadcrumbSaveState('saving')
      breadcrumbSaveTimerRef.current = setTimeout(() => {
        setBreadcrumbSaveState('saved')
        breadcrumbSaveTimerRef.current = null
      }, SAVE_SAVED_RESET_MS)
    }
    ydoc.on('update', onY)
    return () => {
      ydoc.off('update', onY)
      if (breadcrumbSaveTimerRef.current) {
        clearTimeout(breadcrumbSaveTimerRef.current)
        breadcrumbSaveTimerRef.current = null
      }
    }
  }, [collab])

  const breadcrumbLineCount = useMemo(() => {
    const t =
      sectionEditorApiRef.current?.getMarkdown() ??
      sectionQ.data?.content ??
      ''
    if (t.length === 0) {
      return 0
    }
    return t.split('\n').length
  }, [sectionQ.data?.content, breadcrumbDocEpoch])

  const queryClient = useQueryClient()

  const createSectionMut = useMutation({
    mutationFn: (input: { title: string; slug: string | null }) =>
      createSection(pid, {
        title: input.title,
        slug: input.slug,
      }),
    onSuccess: async (section) => {
      await queryClient.invalidateQueries({
        queryKey: ['sections', pid, 'outlineHealth'],
      })
      await queryClient.invalidateQueries({ queryKey: ['project', sfid, pid] })
      void navigate(
        `/studios/${sid}/software/${sfid}/projects/${pid}/sections/${section.id}`,
      )
    },
  })

  const reorderSectionsMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderSections(pid, orderedIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sections', pid, 'outlineHealth'],
      })
      await queryClient.invalidateQueries({ queryKey: ['project', sfid, pid] })
    },
  })

  const resetThreadMut = useMutation({
    mutationFn: () => resetPrivateThread(pid, secid),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['privateThread', pid, secid],
      })
    },
  })

  const { remotePeers, collaboratorCount: focusCollaboratorCount } =
    useCollabAwarenessPresence(collab)

  const editorViewMode =
    layoutMode === 'markdown' ||
    layoutMode === 'preview' ||
    layoutMode === 'split'
      ? layoutMode
      : 'split'

  if (!sid || !sfid || !pid || !secid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileError || profilePending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>No access.</p>
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  const projectHref = `/studios/${sid}/software/${sfid}/projects/${pid}`

  const sectionTitleToolbar =
    sectionQ.data != null ? (
      <div
        className={`flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
          layoutMode === 'focus'
            ? 'rounded-lg border border-zinc-800 bg-zinc-900/40'
            : 'shrink-0 border-b border-zinc-800/60 bg-zinc-900/40'
        }`}
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h1 className="truncate font-serif text-base font-semibold leading-tight tracking-tight text-zinc-100">
            {sectionQ.data.title}
          </h1>
          <span className="shrink-0 font-mono text-[11px] text-zinc-500">
            {sectionQ.data.slug}
          </span>
        </div>
        {layoutMode !== 'focus' && remotePeers.length > 0 ? (
          <div className="flex items-center gap-1.5 sm:order-none">
            <CollaboratorPresenceStack peers={remotePeers} />
          </div>
        ) : null}
        {layoutMode === 'focus' ? (
          <div
            data-testid="section-title-breadcrumb"
            className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-zinc-500"
          >
            <span
              title={`Private · ${focusCollaboratorCount} collaborator${
                focusCollaboratorCount === 1 ? '' : 's'
              }`}
            >
              👥 {focusCollaboratorCount}
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              {breadcrumbSaveState === 'saving' ? 'Saving…' : 'Saved'}
            </span>
            <span className="text-zinc-600">·</span>
            <span>{breadcrumbLineCount} lines</span>
            <button
              type="button"
              onClick={() => setLayoutMode('split')}
              className="rounded-md px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Open editor →
            </button>
            <button
              type="button"
              disabled={resetThreadMut.isPending}
              onClick={() => resetThreadMut.mutate()}
              className="rounded-md px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
            >
              New thread
            </button>
          </div>
        ) : null}
        <SectionLayoutSwitcher mode={layoutMode} onChange={setLayoutMode} />
      </div>
    ) : null

  return (
    <div
      className={`min-h-screen bg-[#0a0a0b] px-8 pt-8 font-sans text-zinc-100 ${
        layoutMode === 'focus'
          ? 'flex flex-col pb-4 lg:h-screen lg:overflow-hidden'
          : 'pb-16'
      }`}
    >
      <div
        className={`mx-auto w-full max-w-[min(1840px,calc(100vw-2rem))] ${
          layoutMode === 'focus' ? 'flex min-h-0 flex-1 flex-col' : ''
        }`}
      >
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={headerTrailingCrumb}
        />

        {sectionQ.isPending && (
          <p className="text-zinc-500">Loading section…</p>
        )}
        {sectionQ.isError && (
          <p className="text-red-400">Could not load section.</p>
        )}
        {sectionQ.data && (
          <div className="flex min-h-0 flex-1 flex-col">
            {layoutMode === 'focus' ? (
              <>
                {sectionTitleToolbar}
                <div className="mt-4 flex min-h-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_top,rgba(91,33,182,0.08),transparent_60%)] transition-opacity duration-150">
                <div className="min-h-0 flex-1">
                  <ThreadPanel
                    studioId={sid}
                    projectId={pid}
                    sectionId={secid}
                    projectHref={projectHref}
                    collab={collab}
                    sectionEditorApiRef={sectionEditorApiRef}
                    editorSelection={editorSelection}
                    onClearEditorSelection={() => setEditorSelection(null)}
                    density="focus"
                    onDraftEmptyChange={setFocusComposerEmpty}
                    healthSummary={sectionHealthQ.data ?? null}
                    canEditContext={access.isStudioEditor}
                    onPatchOverlayChange={handlePatchOverlay}
                    contextRagQuerySynced={syncedContextRagQuery}
                    onContextRagQuerySyncedChange={setSyncedContextRagQuery}
                    copilotTabRequest={copilotTabRequest}
                    onRegisterCopilotDraftSetter={onRegisterCopilotDraftSetter}
                    onRegisterCopilotSlashExecutor={onRegisterCopilotSlashExecutor}
                  />
                </div>
              </div>
              </>
            ) : (
              <div className="section-workspace mt-4 grid min-h-0 flex-1 gap-4 transition-opacity duration-150 lg:min-h-[calc(100vh-10rem)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(300px,420px)] lg:items-stretch">
                <SectionRail
                  studioId={sid}
                  softwareId={sfid}
                  projectId={pid}
                  sections={sectionsListQ.data ?? []}
                  activeSectionId={secid}
                  collapsed={railCollapsed}
                  onToggleCollapsed={() => setRailCollapsed((c) => !c)}
                  addSection={
                    access.canManageProjectOutline
                      ? {
                          isPending: createSectionMut.isPending,
                          onCreate: async (input) => {
                            await createSectionMut.mutateAsync(input)
                          },
                        }
                      : undefined
                  }
                  reorderSections={
                    access.canManageProjectOutline
                      ? {
                          isPending: reorderSectionsMut.isPending,
                          onReorder: (orderedIds) => {
                            reorderSectionsMut.mutate(orderedIds)
                          },
                        }
                      : undefined
                  }
                />
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/30">
                  {sectionTitleToolbar}
                  <HealthRail
                    health={sectionHealthQ.data}
                    openKey={healthOpen}
                    onToggle={(key) => {
                      setHealthOpen((open) => (open === key ? null : key))
                    }}
                    onOpenInCopilot={requestCopilotTab}
                  />
                  {layoutMode === 'context' ? (
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <ContextTab
                        projectId={pid}
                        sectionId={secid}
                        ragQuery={syncedContextRagQuery}
                        includeGitHistory={false}
                        canEditContext={access.isStudioEditor}
                        onRagQueryChange={setSyncedContextRagQuery}
                      />
                    </div>
                  ) : !collab ? (
                    <p className="px-3 py-4 text-zinc-500">Connecting editor…</p>
                  ) : (
                    <div className="min-h-0 flex-1">
                      <SplitEditor
                        collab={collab}
                        defaultMarkdown={sectionQ.data.content ?? ''}
                        readOnly={!access.isStudioEditor}
                        onSelectionChange={onEditorSelectionChange}
                        viewMode={editorViewMode}
                        onViewModeChange={setLayoutMode}
                        patchOverlay={
                          layoutMode === 'context' ? null : patchOverlay
                        }
                        editorApiRef={sectionEditorApiRef}
                        onAiComposerPrefill={onAiComposerPrefill}
                        onCopilotSlashExecute={onCopilotSlashExecute}
                        replaceSelectionSlashDisabled={layoutMode === 'focus'}
                      />
                    </div>
                  )}
                </div>
                <div className="flex h-full min-h-0 min-w-0 flex-col lg:max-w-[420px]">
                  <ThreadPanel
                    studioId={sid}
                    projectId={pid}
                    sectionId={secid}
                    projectHref={projectHref}
                    collab={collab}
                    sectionEditorApiRef={sectionEditorApiRef}
                    editorSelection={editorSelection}
                    onClearEditorSelection={() => setEditorSelection(null)}
                    healthSummary={sectionHealthQ.data ?? null}
                    canEditContext={access.isStudioEditor}
                    onPatchOverlayChange={handlePatchOverlay}
                    contextRagQuerySynced={syncedContextRagQuery}
                    onContextRagQuerySyncedChange={setSyncedContextRagQuery}
                    copilotTabRequest={copilotTabRequest}
                    onRegisterCopilotDraftSetter={onRegisterCopilotDraftSetter}
                    onRegisterCopilotSlashExecutor={onRegisterCopilotSlashExecutor}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <footer
          className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 text-[11px] text-zinc-600 ${
            layoutMode === 'focus' ? 'mt-4 shrink-0 pt-4' : 'mt-16 pt-6'
          }`}
        >
          <span>Atelier · Builder workspace</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
            <Link
              to="/changelog"
              className="text-zinc-500 hover:text-zinc-300 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              v{APP_VERSION}
            </Link>
            <span className="select-none font-sans text-zinc-700" aria-hidden>
              ·
            </span>
            <span
              className="rounded border border-zinc-700/70 px-1.5 py-px text-[10px] font-sans font-normal uppercase tracking-wider text-zinc-500"
              title={`Hosted environment: ${hostedEnvLabel}`}
            >
              {hostedEnvLabel}
            </span>
          </span>
        </footer>
      </div>
    </div>
  )
}
