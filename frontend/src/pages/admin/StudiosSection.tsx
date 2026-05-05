import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Dot,
  Field,
  PageTitle,
  Pill,
  ProviderGlyph,
  StatLabel,
  Toggle,
} from '../../components/admin/adminPrimitives'
import type { AuthErrorBody } from '../../services/api'
import type { LlmProviderRegistryRow, StudioLlmPolicyRow } from '../../services/api'
import {
  getAdminLlmDeployment,
  getAdminStudio,
  getAdminStudioLlmPolicy,
  listAdminStudios,
  patchAdminStudioGitlab,
  postAdminStudio,
  putAdminStudioLlmPolicy,
} from '../../services/api'

const PUBLISH_STRATEGIES = ['Pull Request', 'Direct push', 'Manual export'] as const

function formatApiDetail(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') return d
  }
  return 'Request failed.'
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function buildPolicyRows(
  providers: LlmProviderRegistryRow[],
  existing: StudioLlmPolicyRow[] | undefined,
): StudioLlmPolicyRow[] {
  const map = new Map(existing?.map((r) => [r.provider_key, r]) ?? [])
  return providers.map((p) => {
    const prev = map.get(p.provider_key)
    const defaultModel = p.models[0] ?? null
    return {
      provider_key: p.provider_key,
      enabled: prev?.enabled ?? false,
      selected_model:
        prev?.selected_model && p.models.includes(prev.selected_model)
          ? prev.selected_model
          : defaultModel,
    }
  })
}

export function StudiosSection(): ReactElement {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const [gitProvider, setGitProvider] = useState('')
  const [gitRepoUrl, setGitRepoUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitPublishStrategy, setGitPublishStrategy] = useState('')
  const [newGitToken, setNewGitToken] = useState('')

  const studiosQ = useQuery({
    queryKey: ['admin', 'studios'],
    queryFn: () => listAdminStudios(),
    retry: false,
  })

  const detailQ = useQuery({
    queryKey: ['admin', 'studios', selectedId, 'detail'],
    queryFn: () => getAdminStudio(selectedId),
    enabled: Boolean(selectedId),
    retry: false,
  })

  const deploymentQ = useQuery({
    queryKey: ['admin', 'llm', 'deployment'],
    queryFn: () => getAdminLlmDeployment(),
  })

  const policyQ = useQuery({
    queryKey: ['admin', 'llm', 'policy', selectedId],
    queryFn: () => getAdminStudioLlmPolicy(selectedId),
    enabled: Boolean(selectedId),
  })

  useEffect(() => {
    const list = studiosQ.data
    if (!list?.length) return
    setSelectedId((prev) => {
      if (prev && list.some((s) => s.studio_id === prev)) return prev
      return list[0].studio_id
    })
  }, [studiosQ.data])

  const detail = detailQ.data

  useEffect(() => {
    if (!detail || detail.id !== selectedId) return
    const g = detail.gitlab
    setGitProvider(g.git_provider ?? '')
    setGitRepoUrl(g.git_repo_url ?? '')
    setGitBranch(g.git_branch ?? '')
    setGitPublishStrategy(
      g.git_publish_strategy && PUBLISH_STRATEGIES.includes(g.git_publish_strategy as (typeof PUBLISH_STRATEGIES)[number])
        ? g.git_publish_strategy
        : g.git_publish_strategy || PUBLISH_STRATEGIES[0],
    )
    setNewGitToken('')
  }, [detail, selectedId])

  const createMut = useMutation({
    mutationFn: () =>
      postAdminStudio({
        name: newName.trim(),
        description: newDescription.trim() ? newDescription.trim() : null,
      }),
    onSuccess: async (studio) => {
      setNewOpen(false)
      setNewName('')
      setNewDescription('')
      await qc.invalidateQueries({ queryKey: ['admin', 'studios'] })
      await qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
      setSelectedId(studio.id)
    },
  })

  const saveGitMut = useMutation({
    mutationFn: () =>
      patchAdminStudioGitlab(selectedId, {
        git_provider: gitProvider.trim() ? gitProvider.trim() : null,
        git_repo_url: gitRepoUrl.trim() ? gitRepoUrl.trim() : null,
        git_branch: gitBranch.trim() ? gitBranch.trim() : null,
        git_publish_strategy: gitPublishStrategy.trim()
          ? gitPublishStrategy.trim()
          : null,
        git_token: newGitToken.trim() ? newGitToken.trim() : undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'studios', selectedId, 'detail'] })
    },
  })

  const savePolicy = useMutation({
    mutationFn: ({ sid, rows }: { sid: string; rows: StudioLlmPolicyRow[] }) =>
      putAdminStudioLlmPolicy(sid, { rows }),
    onSuccess: async (_, { sid }) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'llm', 'policy', sid] })
    },
  })

  const providers = deploymentQ.data?.providers ?? []
  const rowsForStudio = useMemo(
    () => buildPolicyRows(providers, policyQ.data),
    [providers, policyQ.data],
  )

  const persistRows = useCallback(
    (next: StudioLlmPolicyRow[]) => {
      if (!selectedId) return
      savePolicy.mutate({ sid: selectedId, rows: next })
    },
    [selectedId, savePolicy],
  )

  const updatePolicyRow = useCallback(
    (providerKey: string, patch: Partial<Pick<StudioLlmPolicyRow, 'enabled' | 'selected_model'>>) => {
      const next = rowsForStudio.map((r) =>
        r.provider_key === providerKey ? { ...r, ...patch } : r,
      )
      persistRows(next)
    },
    [persistRows, rowsForStudio],
  )

  const list = studiosQ.data ?? []
  const publishOptions = useMemo(() => {
    const s = new Set<string>([...PUBLISH_STRATEGIES])
    if (gitPublishStrategy && !s.has(gitPublishStrategy)) {
      s.add(gitPublishStrategy)
    }
    return [...s]
  }, [gitPublishStrategy])
  const gitlab = detail?.gitlab
  const connected =
    Boolean(gitlab?.git_repo_url?.trim()) && Boolean(gitlab?.git_token_set)

  if (studiosQ.isPending) {
    return (
      <div className="space-y-6">
        <PageTitle title="Studios" subtitle="Loading…" />
        <div className="text-sm text-zinc-400">Loading studios…</div>
      </div>
    )
  }

  if (studiosQ.isError) {
    return (
      <div className="space-y-6">
        <PageTitle title="Studios" subtitle="Could not load studios." />
        <p className="text-sm text-rose-300" role="alert">
          {formatApiDetail(studiosQ.error)}
        </p>
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Studios"
          subtitle="Create and configure studios. Connect GitLab for publishing; LLM access is managed in LLM connectivity."
        />
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">
          <p>No studios yet. Create one to get started.</p>
          <Btn
            type="button"
            className="mt-4"
            tone="primary"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            onClick={() => setNewOpen(true)}
          >
            + New studio
          </Btn>
        </div>
        {newOpen ? (
          <NewStudioDialog
            name={newName}
            description={newDescription}
            onName={setNewName}
            onDescription={setNewDescription}
            onClose={() => {
              setNewOpen(false)
              createMut.reset()
            }}
            onSubmit={() => createMut.mutate()}
            isPending={createMut.isPending}
            error={createMut.error}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Studios"
        subtitle="Create and configure studios. Connect GitLab for publishing; LLM access is managed in LLM connectivity."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card
          title="All studios"
          right={
            <Btn
              type="button"
              tone="primary"
              style={{ background: ADMIN_CONSOLE_ACCENT }}
              onClick={() => setNewOpen(true)}
            >
              + New
            </Btn>
          }
        >
          <ul>
            {list.map((s, i) => (
              <li key={s.studio_id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.studio_id)}
                  className={`flex w-full items-center justify-between border-zinc-800/60 px-4 py-3 text-left transition ${i > 0 ? 'border-t' : ''} ${selectedId === s.studio_id ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/40'}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-950 font-mono text-[10px] text-zinc-300">
                        {s.name
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <span className="truncate text-[13px] text-zinc-100">{s.name}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {s.software_count} software · {s.member_count} members
                    </div>
                  </div>
                  {selectedId === s.studio_id ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: ADMIN_CONSOLE_ACCENT }}
                    />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          {detailQ.isPending ? (
            <div className="text-sm text-zinc-400">Loading studio…</div>
          ) : detailQ.isError ? (
            <p className="text-sm text-rose-300" role="alert">
              {formatApiDetail(detailQ.error)}
            </p>
          ) : detail ? (
            <>
              <Card title={detail.name}>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
                  <Field label="Display name" value={detail.name} readOnly />
                  <Field label="Studio ID" value={detail.id} mono readOnly />
                  <Field label="Created" value={formatDate(detail.created_at)} readOnly />
                  <Field
                    label="Members"
                    value={`${detail.member_count} members`}
                    readOnly
                  />
                </div>
              </Card>

              <Card
                title="GitLab connectivity"
                right={
                  <Pill tone={connected ? 'emerald' : 'amber'}>
                    <Dot tone={connected ? 'emerald' : 'amber'} />
                    {connected ? 'connected' : 'not connected'}
                  </Pill>
                }
              >
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <StatLabel>Git provider</StatLabel>
                    <input
                      value={gitProvider}
                      onChange={(e) => setGitProvider(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
                      placeholder="gitlab"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <StatLabel>Repository URL</StatLabel>
                    <input
                      value={gitRepoUrl}
                      onChange={(e) => setGitRepoUrl(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
                      placeholder="https://gitlab.example.com/group/project.git"
                    />
                  </div>
                  <div>
                    <StatLabel>Default branch</StatLabel>
                    <input
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
                      placeholder="main"
                    />
                  </div>
                  <div>
                    <StatLabel>Publish strategy</StatLabel>
                    <select
                      value={gitPublishStrategy}
                      onChange={(e) => setGitPublishStrategy(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-100 outline-none"
                    >
                      {publishOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <StatLabel>Deploy token</StatLabel>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Stored token: {gitlab?.git_token_set ? 'set' : 'not set'}. Enter a new
                      value below to rotate (optional).
                    </p>
                    <input
                      value={newGitToken}
                      onChange={(e) => setNewGitToken(e.target.value)}
                      type="password"
                      autoComplete="off"
                      className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-[12px] text-zinc-100 outline-none focus:border-zinc-600"
                      placeholder="glpat-…"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end border-t border-zinc-800/60 px-5 py-3">
                  <Btn
                    type="button"
                    tone="primary"
                    style={{ background: ADMIN_CONSOLE_ACCENT }}
                    disabled={saveGitMut.isPending || !selectedId}
                    onClick={() => saveGitMut.mutate()}
                  >
                    {saveGitMut.isPending ? 'Saving…' : 'Save GitLab settings'}
                  </Btn>
                </div>
                {saveGitMut.isError ? (
                  <p className="px-5 pb-3 text-[12px] text-rose-300" role="alert">
                    {formatApiDetail(saveGitMut.error)}
                  </p>
                ) : null}
              </Card>

              <Card title="Allowed providers (this studio)">
                {deploymentQ.isPending ? (
                  <div className="px-5 py-4 text-sm text-zinc-500">Loading providers…</div>
                ) : providers.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-zinc-500">
                    No providers registered. Add one under LLM connectivity.
                  </div>
                ) : (
                  <ul>
                    {providers.map((p, i) => (
                      <li
                        key={p.provider_key}
                        className={`flex items-center justify-between px-5 py-3 ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <ProviderGlyph name={p.display_name} />
                          <div>
                            <div className="text-[13px] text-zinc-100">{p.display_name}</div>
                            <div className="text-[11px] text-zinc-500">
                              {p.models.length} model{p.models.length === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>
                        <Toggle
                          checked={
                            rowsForStudio.find((r) => r.provider_key === p.provider_key)
                              ?.enabled ?? false
                          }
                          onChange={() => {
                            const row = rowsForStudio.find((r) => r.provider_key === p.provider_key)
                            if (!row) return
                            updatePolicyRow(p.provider_key, { enabled: !row.enabled })
                          }}
                          disabled={p.status !== 'connected' || savePolicy.isPending}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {policyQ.isError ? (
                  <p className="px-5 pb-3 text-[12px] text-rose-300" role="alert">
                    {formatApiDetail(policyQ.error)}
                  </p>
                ) : null}
              </Card>
            </>
          ) : null}
        </div>
      </div>

      {newOpen ? (
        <NewStudioDialog
          name={newName}
          description={newDescription}
          onName={setNewName}
          onDescription={setNewDescription}
          onClose={() => {
            setNewOpen(false)
            createMut.reset()
          }}
          onSubmit={() => createMut.mutate()}
          isPending={createMut.isPending}
          error={createMut.error}
        />
      ) : null}
    </div>
  )
}

function NewStudioDialog({
  name,
  description,
  onName,
  onDescription,
  onClose,
  onSubmit,
  isPending,
  error,
}: {
  name: string
  description: string
  onName: (v: string) => void
  onDescription: (v: string) => void
  onClose: () => void
  onSubmit: () => void
  isPending: boolean
  error?: unknown
}): ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-studio-title"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
        <h2 id="new-studio-title" className="text-lg font-semibold text-zinc-100">
          New studio
        </h2>
        <div className="mt-4 space-y-3">
          <div>
            <StatLabel>Name</StatLabel>
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
              placeholder="My studio"
            />
          </div>
          <div>
            <StatLabel>Description (optional)</StatLabel>
            <textarea
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-zinc-600"
            />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-[12px] text-rose-300" role="alert">
            {formatApiDetail(error)}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Btn>
          <Btn
            type="button"
            tone="primary"
            style={{ background: ADMIN_CONSOLE_ACCENT }}
            disabled={isPending || !name.trim()}
            onClick={onSubmit}
          >
            {isPending ? 'Creating…' : 'Create'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
