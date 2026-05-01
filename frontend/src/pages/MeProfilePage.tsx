import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { me, patchMeProfile } from '../services/api'

export function MeProfilePage(): ReactElement {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: profile, isPending, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })
  const [name, setName] = useState('')

  useEffect(() => {
    if (isError) {
      void navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  useEffect(() => {
    if (profile) setName(profile.user.display_name)
  }, [profile])

  const save = useMutation({
    mutationFn: () => patchMeProfile({ display_name: name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })

  function onSubmit(e: FormEvent): void {
    e.preventDefault()
    void save.mutateAsync()
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (isPending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-md">
        <Link
          to="/"
          className="text-sm font-medium text-violet-400 hover:underline"
        >
          ← Back to home
        </Link>
        <h1 className="mt-6 font-serif text-3xl font-medium tracking-tight text-zinc-100">
          Profile
        </h1>
        <p className="mt-2 text-sm text-zinc-500">{profile.user.email}</p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-zinc-400" htmlFor="profile-display-name">
            Display name
            <input
              id="profile-display-name"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-violet-600"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              required
            />
          </label>
          {save.isError ? (
            <p className="text-sm text-rose-400">Could not save. Check your input.</p>
          ) : null}
          {save.isSuccess ? (
            <p className="text-sm text-emerald-400">Saved.</p>
          ) : null}
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  )
}
