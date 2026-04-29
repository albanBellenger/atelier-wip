const TOKEN_KEY = 'atelier_token'

const base = (): string => import.meta.env.VITE_API_BASE_URL ?? ''

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export interface AuthErrorBody {
  detail: string | unknown
  code: string
}

export interface TokenResponse {
  access_token: string
  token_type?: string
}

export interface RegisterRequestBody {
  email: string
  password: string
  display_name: string
}

export interface LoginRequestBody {
  email: string
  password: string
}

export async function register(
  body: RegisterRequestBody,
): Promise<TokenResponse> {
  const r = await fetch(`${base()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await r.json()
  if (!r.ok) throw data as AuthErrorBody
  return data as TokenResponse
}

export async function login(body: LoginRequestBody): Promise<TokenResponse> {
  const r = await fetch(`${base()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await r.json()
  if (!r.ok) throw data as AuthErrorBody
  return data as TokenResponse
}

export interface MeResponse {
  user: {
    id: string
    email: string
    display_name: string
    is_tool_admin: boolean
  }
  studios: { studio_id: string; studio_name: string; role: string }[]
}

export async function me(token: string): Promise<MeResponse> {
  const r = await fetch(`${base()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data: unknown = await r.json()
  if (!r.ok) throw data as AuthErrorBody
  return data as MeResponse
}
