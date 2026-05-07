import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import type { EditorSelectionState } from '../editor/SplitEditor'
import { BuilderHomeHeader } from '../home/BuilderHomeHeader'
import { ContextPopover } from './annotations/ContextPopover'
import type { AnnotationBlockRef } from './annotations/useAnnotations'
import { useAnnotations } from './annotations/useAnnotations'
import { DocCanvas } from './canvas/DocCanvas'
import { SelectionToolbar } from './canvas/SelectionToolbar'
import { CopilotOverlay } from './copilot/CopilotOverlay'
import { CopilotToggle } from './chrome/CopilotToggle'
import { OutlineRail } from './chrome/OutlineRail'
import { StatusBar } from './chrome/StatusBar'
import { TopBar } from './chrome/TopBar'
import { useDocBlocks } from './hooks/useDocBlocks'
import { useEditorV2Prefs } from './hooks/useEditorV2Prefs'
import { useSelection } from './hooks/useSelection'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../../lib/hostedEnvironment'
import { APP_VERSION } from '../../version'
import {
  getProject,
  getSection,
  getSectionHealth,
  getSoftware,
  listProjectIssues,
  listProjects,
  listSections,
  listSoftware,
  listWorkOrders,
  logout as logoutApi,
  me,
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

  const issuesQ = useQuery({
    queryKey: ['issues', pid, secid, 'v2'],
    queryFn: () => listProjectIssues(pid, { sectionId: secid }),
    enabled: Boolean(pid && secid && access.isMember),
  })

  const staleWoQ = useQuery({
    queryKey: ['workOrders', pid, 'stale', secid],
    queryFn: () =>
      listWorkOrders(pid, { section_id: secid, is_stale: true }),
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

  const [editorSelection] = useState<EditorSelectionState | null>(null)

  const [copilotOpen, setCopilotOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [sessionFlip, setSessionFlip] = useState(false)
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
  const { selection, setSelection, clearSelection } = useSelection()

  const [wordCount, setWordCount] = useState(0)
  const wordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ytext = collab?.ytext ?? null
  const { blocks } = useDocBlocks(ytext)

  useEffect(() => {
    setSessionFlip(false)
  }, [secid])

  useEffect(() => {
    if (!ytext) {
      return
    }
    const bump = (): void => {
      if (wordTimerRef.current) {
        clearTimeout(wordTimerRef.current)
      }
      wordTimerRef.current = setTimeout(() => {
        const t = ytext.toString().trim()
        const wc = t.length === 0 ? 0 : t.split(/\s+/).filter(Boolean).length
        setWordCount(wc)
        wordTimerRef.current = null
      }, 500)
    }
    bump()
    ytext.observe(bump)
    return () => {
      ytext.unobserve(bump)
      if (wordTimerRef.current) {
        clearTimeout(wordTimerRef.current)
      }
    }
  }, [ytext])

  const annotationBlocks: AnnotationBlockRef[] = useMemo(
    () =>
      blocks.map((b) => ({
        id: b.id,
        kind: b.type,
        text: b.type === 'ul' ? b.items.join('\n') : b.text,
      })),
    [blocks],
  )

  const pendingSuggestionLabel = patchOverlay?.mergedMarkdown?.trim()
    ? patchOverlay.mergedMarkdown.trim().slice(0, 120)
    : null

  const annotations = useAnnotations({
    sectionId: secid,
    blocks: annotationBlocks,
    issues: issuesQ.data,
    staleWorkOrders: staleWoQ.data,
    pendingSuggestionLabel,
  })

  const displayRaw = v2prefs.outlineRawDefault !== sessionFlip

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
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection])

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
              />
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    {!collab || !ytext ? (
                      <p className="px-4 py-6 text-zinc-500">
                        Connecting editor…
                      </p>
                    ) : (
                      <DocCanvas
                        ytext={ytext}
                        blocks={blocks}
                        annotations={annotations}
                        displayRaw={displayRaw}
                        patchOverlay={patchOverlay}
                        selectedBlockId={selection?.blockId ?? null}
                        onSelectBlock={(id) => {
                          setSelection(id ? { blockId: id } : null)
                        }}
                      />
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
                      rawMode={v2prefs.outlineRawDefault}
                      onSetRawDefault={(raw) => {
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

        <SelectionToolbar
          visible={selection != null}
          onDismiss={() => clearSelection()}
          label="Block selected"
        />

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
              editorSelection={editorSelection}
              onClearEditorSelection={() => {}}
              healthSummary={sectionHealthQ.data ?? null}
              canEditContext={access.isStudioEditor}
              onPatchOverlayChange={handlePatchOverlay}
              contextRagQuerySynced={syncedContextRagQuery}
              onContextRagQuerySyncedChange={setSyncedContextRagQuery}
              copilotTabRequest={null}
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
