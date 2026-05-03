import { describe, expect, it } from 'vitest'

import { summarizePeerEdit } from './copilotPeerEditSummary'

describe('summarizePeerEdit', () => {
  it('uses generic copy when no remote names', () => {
    expect(summarizePeerEdit([])).toBe('Collaborators edited the section')
    expect(summarizePeerEdit(['', '  '])).toBe('Collaborators edited the section')
  })

  it('uses one or two names', () => {
    expect(summarizePeerEdit(['Alice'])).toBe('Alice edited the section')
    expect(summarizePeerEdit(['Alice', 'Bob'])).toBe('Alice and Bob edited the section')
  })

  it('dedupes identical names', () => {
    expect(summarizePeerEdit(['Ada', 'Ada'])).toBe('Ada edited the section')
  })

  it('summarizes three or more distinct names', () => {
    expect(summarizePeerEdit(['A', 'B', 'C'])).toBe('A, B, and others edited the section')
  })
})
