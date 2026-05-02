import { describe, expect, it } from 'vitest'

import {
  hostedEnvironmentLabel,
  resolveHostedEnvironment,
} from './hostedEnvironment'

describe('resolveHostedEnvironment', () => {
  it('maps VITE_ATELIER_ENV aliases before mode', () => {
    expect(
      resolveHostedEnvironment({
        mode: 'production',
        dev: false,
        viteAtelierEnv: 'staging',
      }),
    ).toBe('test')
    expect(
      resolveHostedEnvironment({
        mode: 'development',
        dev: true,
        viteAtelierEnv: 'prod',
      }),
    ).toBe('production')
  })

  it('falls back to dev when DEV or development mode', () => {
    expect(
      resolveHostedEnvironment({ mode: 'development', dev: true }),
    ).toBe('dev')
    expect(
      resolveHostedEnvironment({ mode: 'production', dev: true }),
    ).toBe('dev')
  })

  it('uses test when MODE is test (no override)', () => {
    expect(resolveHostedEnvironment({ mode: 'test', dev: false })).toBe(
      'test',
    )
  })

  it('defaults to production', () => {
    expect(
      resolveHostedEnvironment({ mode: 'production', dev: false }),
    ).toBe('production')
  })
})

describe('hostedEnvironmentLabel', () => {
  it('returns display labels', () => {
    expect(hostedEnvironmentLabel('dev')).toBe('Dev')
    expect(hostedEnvironmentLabel('test')).toBe('Test')
    expect(hostedEnvironmentLabel('production')).toBe('Production')
  })
})
