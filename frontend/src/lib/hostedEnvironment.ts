/** Override via `VITE_ATELIER_ENV` (e.g. dev, test, staging, production). */
export type HostedEnvironmentKind = 'dev' | 'test' | 'production'

export type HostedEnvironmentInput = {
  mode: string
  dev: boolean
  /** `import.meta.env.VITE_ATELIER_ENV` */
  viteAtelierEnv?: string
}

export function resolveHostedEnvironment(
  input: HostedEnvironmentInput,
): HostedEnvironmentKind {
  const raw = input.viteAtelierEnv?.trim().toLowerCase()
  if (raw) {
    if (raw === 'dev' || raw === 'development') return 'dev'
    if (raw === 'test' || raw === 'staging') return 'test'
    if (raw === 'production' || raw === 'prod') return 'production'
  }
  if (input.dev || input.mode === 'development') return 'dev'
  if (input.mode === 'test') return 'test'
  return 'production'
}

export function getHostedEnvironment(): HostedEnvironmentKind {
  return resolveHostedEnvironment({
    mode: import.meta.env.MODE,
    dev: import.meta.env.DEV,
    viteAtelierEnv: import.meta.env.VITE_ATELIER_ENV,
  })
}

export function hostedEnvironmentLabel(
  kind: HostedEnvironmentKind,
): 'Dev' | 'Test' | 'Production' {
  switch (kind) {
    case 'dev':
      return 'Dev'
    case 'test':
      return 'Test'
    case 'production':
      return 'Production'
  }
}
