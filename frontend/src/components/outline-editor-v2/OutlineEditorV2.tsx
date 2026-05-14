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

import type { EditorSelectionState } from '../editor/editorSelection'
import { CrepeEditor, type CrepeEditorApi } from '../editor/CrepeEditor'
import { BuilderHomeHeader } from '../home/BuilderHomeHeader'
import { ContextPopover } from './annotations/ContextPopover'
import { SuggestionBlock } from './canvas/SuggestionBlock'
import { CopilotOverlay } from './copilot/CopilotOverlay'
import { CopilotToggle } from './chrome/CopilotToggle'
import { OutlineRail } from './chrome/OutlineRail'
import { StatusBar } from './chrome/StatusBar'
import { TopBar } from './chrome/TopBar'
import { useEditorV2Prefs } from './hooks/useEditorV2Prefs'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../../lib/hostedEnvironment'
import { APP_VERSION } from '../../version'
import type { SectionUpdateBody } from '../../services/api'
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
  updateSection,
} from '../../services/api'
import { CopilotPanel } from '../thread/CopilotPanel'
import { colorsForUser, useYjsCollab } from '../../hooks/useYjsCollab'
import { useStudioAccess } from '../../hooks/useStudioAccess'

/** Outline Editor V2 — document canvas + slide-over copilot (reuses Yjs + CopilotPanel). */
export function OutlineEditorV2(): ReactElement {
  const v2prefs = useEditorV2Prefs()
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
  const queryClient = useQueryClient()

  const createSectionMut = useMutation({
    mutationFn: (input: { title: string; slug: string | null }) =>
      createSection(pid, {
        title: input.title,
        slug: input.slug,
      }),
    onSuccess: async (section) => {
      await queryClient.invalidateQueries({ queryKey: ['sections', pid] })
      await queryClient.invalidateQueries({ queryKey: ['project', sfid, pid] })
      void navigate(
        `/studios/${sid}/software/${sfid}/projects/${pid}/sections/${section.id}`,
      )
    },
  })

  const reorderSectionsMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderSections(pid, orderedIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sections', pid] })
      await queryClient.invalidateQueries({ queryKey: ['project', sfid, pid] })
    },
  })

  const renameSectionMut = useMutation({
    mutationFn: (body: SectionUpdateBody) =>
      updateSection(pid, secid, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['section', pid, secid] })
      await queryClient.invalidateQueries({ queryKey: ['sections', pid] })
      await queryClient.invalidateQueries({ queryKey: ['project', sfid, pid] })
    },
  })

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
    }
  }, [profile?.user?.display_name, profile?.user?.id])

  const collab = useYjsCollab(
    sectionQ.data ? pid : undefined,
    sectionQ.data ? secid : undefined,
    collabUser,
  )

  const [editorSelection, setEditorSelection] =
    useState<EditorSelectionState | null>(null)
  const onEditorSelectionChange = useCallback(
    (sel: EditorSelectionState | null) => {
      setEditorSelection(sel)
    },
    [],
  )

  const [copilotOpen, setCopilotOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [sessionFlip, setSessionFlip] = useState(false)
  const displayRaw = v2prefs.outlineRawDefault !== sessionFlip
  const [patchOverlay, setPatchOverlay] =
    useState<SectionPatchOverlayState | null>(null)
  const [syncedContextRagQuery, setSyncedContextRagQuery] = useState('')
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

  const [contextPopoverOpen, setContextPopoverOpen] = useState(false)
  const [docRenderTick, setDocRenderTick] = useState(0)

  const [wordCount, setWordCount] = useState(0)
  const wordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const outlineCopilotEditorRef = useRef<CrepeEditorApi | null>(null)
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

  /** Copilot lives in `CopilotOverlay`; panel mounts only when open, so defer until after mount. */
  const onAiComposerPrefill = useCallback((markdown: string) => {
    setCopilotOpen(true)
    window.setTimeout(() => {
      copilotSetDraftRef.current?.(markdown)
    }, 0)
  }, [])

  const onCopilotSlashExecute = useCallback((raw: string) => {
    setCopilotOpen(true)
    window.setTimeout(() => {
      void copilotSlashExecutorRef.current?.(raw)
    }, 0)
  }, [])

  const defaultSectionMarkdown = sectionQ.data?.content ?? ''

  useEffect(() => {
    setSessionFlip(false)
  }, [secid])

  useEffect(() => {
    if (!collab) {
      return
    }
    const onAfter = (): void => {
      setDocRenderTick((n) => n + 1)
    }
    collab.ydoc.on('afterTransaction', onAfter)
    return () => {
      collab.ydoc.off('afterTransaction', onAfter)
    }
  }, [collab, defaultSectionMarkdown])

  useEffect(() => {
    const schedule = (): void => {
      if (wordTimerRef.current) {
        clearTimeout(wordTimerRef.current)
      }
      wordTimerRef.current = setTimeout(() => {
        const t =
          outlineCopilotEditorRef.current?.getMarkdown() ?? defaultSectionMarkdown
        const trimmed = t.trim()
        const wc =
          trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length
        setWordCount(wc)
        wordTimerRef.current = null
      }, 500)
    }
    if (!collab) {
      return undefined
    }
    schedule()
    collab.ydoc.on('afterTransaction', schedule)
    return () => {
      collab.ydoc.off('afterTransaction', schedule)
      if (wordTimerRef.current) {
        clearTimeout(wordTimerRef.current)
        wordTimerRef.current = null
      }
    }
  }, [collab, defaultSectionMarkdown])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCopilotOpen((o) => !o)
        return
      }
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setSessionFlip((f) => !f)
        return
      }
      if (e.key === 'Escape') {
        setCopilotOpen(false)
        setContextPopoverOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const health = sectionHealthQ.data

  const projectHref = `/studios/${sid}/software/${sfid}/projects/${pid}`

  if (!sid || !sfid || !pid || !secid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-[#0a0a0b]" />
  }

  if (profileError || profilePending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] px-4 py-12 text-zinc-100">
        <p>No access.</p>
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0b] px-6 pb-6 pt-8 font-sans text-zinc-100">
      <div className="mx-auto flex min-h-0 w-full max-w-[min(1840px,calc(100vw-3rem))] flex-1 flex-col">
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={headerTrailingCrumb}
        />

        {sectionQ.isPending && (
          <p className="mt-4 text-zinc-500">Loading section…</p>
        )}
        {sectionQ.isError && (
          <p className="mt-4 text-red-400">Could not load section.</p>
        )}

        {sectionQ.data && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800/80 bg-[#08080a]">
            <TopBar
              title={sectionQ.data.title}
              slug={sectionQ.data.slug}
              rename={
                access.isStudioAdmin
                  ? {
                      isSaving: renameSectionMut.isPending,
                      onSave: async (patch) => {
                        const body: SectionUpdateBody = {}
                        if (patch.title !== undefined) {
                          body.title = patch.title
                        }
                        if (patch.slug !== undefined) {
                          body.slug = patch.slug
                        }
                        await renameSectionMut.mutateAsync(body)
                      },
                    }
                  : undefined
              }
              trailing={
                <CopilotToggle
                  open={copilotOpen}
                  onToggle={() => setCopilotOpen((o) => !o)}
                  badgeCount={patchOverlay != null ? 1 : 0}
                />
              }
            />
            <div className="flex min-h-0 flex-1">
              <OutlineRail
                studioId={sid}
                softwareId={sfid}
                projectId={pid}
                sections={sectionsListQ.data ?? []}
                activeSectionId={secid}
                collapsed={railCollapsed}
                onToggleCollapsed={() => setRailCollapsed((c) => !c)}
                pinned={v2prefs.outlineRailPinned}
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
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    {!collab || !sectionQ.data ? (
                      <p className="px-4 py-6 text-zinc-500">
                        Connecting editor…
                      </p>
                    ) : (
                      <div
                        data-testid="doc-canvas"
                        className="outline-editor-shell relative flex min-h-0 flex-1 flex-col overflow-hidden"
                      >
                        <SuggestionBlock overlay={patchOverlay} />
                        <div
                          className={
                            displayRaw
                              ? 'pointer-events-none invisible absolute inset-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                              : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                          }
                          aria-hidden={displayRaw}
                        >
                          <div
                            data-testid="crepe-host"
                            className="min-h-0 min-w-0 flex-1 overflow-hidden bg-zinc-950"
                          >
                            <CrepeEditor
                              ref={outlineCopilotEditorRef}
                              collab={collab}
                              defaultMarkdown={sectionQ.data.content ?? ''}
                              readOnly={!access.isStudioEditor}
                              onSelectionChange={onEditorSelectionChange}
                              patchOverlay={patchOverlay}
                              onAiComposerPrefill={onAiComposerPrefill}
                              onCopilotSlashExecute={onCopilotSlashExecute}
                              replaceSelectionSlashDisabled={false}
                            />
                          </div>
                        </div>
                        {displayRaw ? (
                          <div className="outline-editor-shell absolute inset-0 z-[1] min-h-0 flex-1 overflow-auto bg-[#08080a] p-4 font-mono text-sm leading-relaxed text-zinc-200">
                            <pre className="whitespace-pre-wrap">
                              {(() => {
                                void docRenderTick
                                return (
                                  outlineCopilotEditorRef.current?.getMarkdown() ??
                                  defaultSectionMarkdown
                                )
                              })()}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <StatusBar
                      driftCount={health?.drift_count ?? 0}
                      gapCount={health?.gap_count ?? 0}
                      tokenUsed={health?.token_used ?? 0}
                      tokenBudget={health?.token_budget ?? 0}
                      citationsResolved={health?.citations_resolved ?? 0}
                      citationsMissing={health?.citations_missing ?? 0}
                      wordCount={wordCount}
                      filename={`${sectionQ.data.slug}.md`}
                      rawMode={displayRaw}
                      onSetRawDefault={(raw) => {
                        setSessionFlip(false)
                        v2prefs.setOutlineRawDefault(raw)
                      }}
                      onTokenClick={() => setContextPopoverOpen((o) => !o)}
                    />
                    <div className="absolute bottom-full right-6">
                      <ContextPopover
                        open={contextPopoverOpen}
                        onClose={() => setContextPopoverOpen(false)}
                        tokenUsed={health?.token_used ?? 0}
                        tokenBudget={health?.token_budget ?? 0}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <CopilotOverlay
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
        >
          {collab ? (
            <CopilotPanel
              studioId={sid}
              projectId={pid}
              sectionId={secid}
              projectHref={projectHref}
              collab={collab}
              sectionEditorApiRef={outlineCopilotEditorRef}
              editorSelection={editorSelection}
              onClearEditorSelection={() => {
                setEditorSelection(null)
              }}
              healthSummary={sectionHealthQ.data ?? null}
              canEditContext={access.isStudioEditor}
              onPatchOverlayChange={handlePatchOverlay}
              contextRagQuerySynced={syncedContextRagQuery}
              onContextRagQuerySyncedChange={setSyncedContextRagQuery}
              copilotTabRequest={null}
              onRegisterCopilotDraftSetter={onRegisterCopilotDraftSetter}
              onRegisterCopilotSlashExecutor={onRegisterCopilotSlashExecutor}
            />
          ) : (
            <p className="p-4 text-sm text-zinc-500">Connecting…</p>
          )}
        </CopilotOverlay>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
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
