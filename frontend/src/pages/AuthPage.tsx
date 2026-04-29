import { useMutation } from '@tanstack/react-query'
import type { FormEvent, ReactElement } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, setToken, type AuthErrorBody } from '../services/api'

type Mode = 'login' | 'register'

export function AuthPage(): ReactElement {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (vars: {
      mode: Mode
      email: string
      password: string
      displayName: string
    }) => {
      if (vars.mode === 'register') {
        return register({
          email: vars.email,
          password: vars.password,
          display_name: vars.displayName,
        })
      }
      return login({ email: vars.email, password: vars.password })
    },
    onSuccess: (res) => {
      setToken(res.access_token)
      navigate('/')
    },
    onError: (err: unknown) => {
      const b = err as AuthErrorBody
      setError(typeof b.detail === 'string' ? b.detail : 'Request failed')
    },
  })

  function onSubmit(e: FormEvent): void {
    e.preventDefault()
    setError(null)
    mutation.mutate({ mode, email, password, displayName })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl backdrop-blur">
        <h1 className="mb-1 text-center text-2xl font-semibold tracking-tight text-zinc-100">
          Atelier
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500">
          Sign in to continue
        </p>

        <div className="mb-6 flex rounded-lg bg-zinc-800/80 p-1">
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'login'
                ? 'bg-zinc-700 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => {
              setMode('login')
              setError(null)
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === 'register'
                ? 'bg-zinc-700 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => {
              setMode('register')
              setError(null)
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label
                htmlFor="displayName"
                className="mb-1 block text-xs font-medium text-zinc-400"
              >
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                required
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-100 outline-none ring-violet-500/0 transition focus:ring-2"
              />
            </div>
          )}
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-medium text-zinc-400"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {mutation.isPending
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
