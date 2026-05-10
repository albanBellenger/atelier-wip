import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
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
import { useStudioLlmPolicy } from '../../hooks/useStudioLlmPolicy'
import {
  deleteAdminStudio,
  getAdminStudio,
  listAdminStudios,
  postAdminStudio,
} from '../../services/api'

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

export function StudiosSection(): ReactElement {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')

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

  useEffect(() => {
    const list = studiosQ.data
    if (!list?.length) {
      setSelectedId('')
      return
    }
    setSelectedId((prev) => {
      if (prev && list.some((s) => s.studio_id === prev)) return prev
      return list[0].studio_id
    })
  }, [studiosQ.data])

  const {
    deploymentQuery,
    policyQuery,
    connectedProviders,
    rowsForStudio,
    savePolicyIsPending,
    updatePolicyRow,
  } = useStudioLlmPolicy(selectedId)

  const detail = detailQ.data

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

  const deleteMut = useMutation({
    mutationFn: (studioId: string) => deleteAdminStudio(studioId),
    onSuccess: async (_, deletedId) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'studios'] })
      await qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
      void qc.removeQueries({ queryKey: ['admin', 'studios', deletedId, 'detail'] })
      void qc.removeQueries({ queryKey: ['admin', 'llm', 'policy', deletedId] })
    },
  })

  const list = studiosQ.data ?? []
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
          subtitle="All studios in one list. Platform admins can create or delete a studio here; per-studio Git and budgets are managed by studio owners; LLM registry and routing stay in LLM connectivity."
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
        subtitle="All studios in one list. Platform admins can create or delete a studio here; per-studio Git and budgets are managed by studio owners; LLM registry and routing stay in LLM connectivity."
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
                <div className="flex flex-col items-end gap-2 border-t border-zinc-800/60 px-5 py-3">
                  <Btn
                    type="button"
                    tone="danger"
                    size="sm"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete studio "${detail.name}" and all software and projects under it? This cannot be undone.`,
                        )
                      ) {
                        return
                      }
                      deleteMut.mutate(selectedId)
                    }}
                  >
                    {deleteMut.isPending ? 'Deleting…' : 'Delete studio'}
                  </Btn>
                  {deleteMut.isError ? (
                    <p className="max-w-md text-right text-[11px] text-rose-300" role="alert">
                      {formatApiDetail(deleteMut.error)}
                    </p>
                  ) : null}
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
                  <Field
                    label="Git provider"
                    value={gitlab?.git_provider?.trim() || '—'}
                    readOnly
                  />
                  <Field
                    label="Default branch"
                    value={gitlab?.git_branch?.trim() || '—'}
                    readOnly
                  />
                  <Field
                    label="Repository URL"
                    value={gitlab?.git_repo_url?.trim() || '—'}
                    mono
                    readOnly
                  />
                  <Field
                    label="Publish strategy"
                    value={gitlab?.git_publish_strategy?.trim() || '—'}
                    readOnly
                  />
                  <Field
                    label="Deploy token"
                    value={gitlab?.git_token_set ? 'set' : 'not set'}
                    readOnly
                  />
                </div>
                <p className="border-t border-zinc-800/60 px-5 py-3 text-[11px] text-zinc-500">
                  Git settings are managed by each studio&apos;s owners in software settings.
                </p>
              </Card>

              <Card title="Allowed providers (this studio)">
                {deploymentQuery.isPending ? (
                  <div className="px-5 py-4 text-sm text-zinc-500">Loading providers…</div>
                ) : connectedProviders.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-zinc-500">
                    No connected LLM providers yet. Connect a provider under LLM connectivity (run Test).
                  </div>
                ) : (
                  <ul>
                    {connectedProviders.map((p, i) => (
                      <li
                        key={p.provider_id}
                        className={`flex items-center justify-between px-5 py-3 ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <ProviderGlyph name={p.provider_id} />
                          <div>
                            <div className="text-[13px] text-zinc-100">{p.provider_id}</div>
                            <div className="text-[11px] text-zinc-500">
                              {p.models.length} model{p.models.length === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>
                        <Toggle
                          checked={
                            rowsForStudio.find((r) => r.provider_id === p.provider_id)
                              ?.enabled ?? false
                          }
                          onChange={() => {
                            const row = rowsForStudio.find((r) => r.provider_id === p.provider_id)
                            if (!row) return
                            updatePolicyRow(p.provider_id, { enabled: !row.enabled })
                          }}
                          disabled={savePolicyIsPending}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {policyQuery.isError ? (
                  <p className="px-5 pb-3 text-[12px] text-rose-300" role="alert">
                    {formatApiDetail(policyQuery.error)}
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
