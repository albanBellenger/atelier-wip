import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createStudio,
  listStudios,
  type StudioCreateBody,
} from '../services/api'

export function StudiosListPage(): ReactElement {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const { data: studios, isPending, isError } = useQuery({
    queryKey: ['studios'],
    queryFn: () => listStudios(),
    retry: false,
  })

  useEffect(() => {
    if (isError) {
      void navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  const createMut = useMutation({
    mutationFn: (body: StudioCreateBody) => createStudio(body),
    onSuccess: (s) => {
      setName('')
      setDesc('')
      void qc.invalidateQueries({ queryKey: ['studios'] })
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      navigate(`/studios/${s.id}`)
    },
    onError: (e: unknown) => {
      const x = e as { detail?: string }
      setErr(typeof x.detail === 'string' ? x.detail : 'Failed')
    },
  })

  function onCreate(e: FormEvent): void {
    e.preventDefault()
    setErr(null)
    createMut.mutate({
      name: name.trim(),
      description: desc.trim() || null,
    })
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Studios</h1>
          <Link
            to="/"
            className="text-sm text-violet-400 hover:underline"
          >
            Home
          </Link>
        </div>

        <form
          onSubmit={onCreate}
          className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
        >
          <h2 className="mb-3 text-sm font-medium text-zinc-300">
            Create studio
          </h2>
          <div className="space-y-3">
            <input
              required
              placeholder="Studio name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Description (optional)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            />
          </div>
          {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={createMut.isPending}
            className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Create
          </button>
        </form>

        {isPending && (
          <p className="text-zinc-500">Loading studios…</p>
        )}
        {!isPending && studios && studios.length === 0 && (
          <p className="text-zinc-500">No studios yet — create one above.</p>
        )}
        <ul className="space-y-2">
          {studios?.map((s) => (
            <li key={s.id}>
              <Link
                to={`/studios/${s.id}`}
                className="block rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-600"
              >
                <span className="font-medium">{s.name}</span>
                {s.description && (
                  <span className="mt-1 block text-sm text-zinc-500">
                    {s.description}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
