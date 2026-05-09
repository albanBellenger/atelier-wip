import { usageScopeLabel, usageScopeTitle } from './tokenUsageScopeLabels'

describe('tokenUsageScopeLabels', () => {
  it('prefers name over id', () => {
    expect(usageScopeLabel('Acme', 'uuid-1')).toBe('Acme')
    expect(usageScopeTitle('Acme', 'uuid-1')).toBe('Acme (uuid-1)')
  })

  it('falls back to id when name missing', () => {
    expect(usageScopeLabel(null, 'uuid-2')).toBe('uuid-2')
    expect(usageScopeTitle(null, 'uuid-2')).toBe('uuid-2')
  })
})
