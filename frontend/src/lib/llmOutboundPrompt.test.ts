import { describe, expect, it } from 'vitest'

import {
  formatOutboundPromptTokenCount,
  sumOutboundPromptTokens,
} from './llmOutboundPrompt'

describe('sumOutboundPromptTokens', () => {
  it('returns null when no messages or no token fields', () => {
    expect(sumOutboundPromptTokens(undefined)).toBeNull()
    expect(sumOutboundPromptTokens([])).toBeNull()
    expect(
      sumOutboundPromptTokens([{ role: 'user', content: 'x' }]),
    ).toBeNull()
  })

  it('sums finite tokens fields', () => {
    expect(
      sumOutboundPromptTokens([
        { role: 'system', content: 'a', tokens: 10 },
        { role: 'user', content: 'b', tokens: 5 },
      ]),
    ).toBe(15)
  })
})

describe('formatOutboundPromptTokenCount', () => {
  it('uses grouping separator for large numbers', () => {
    expect(formatOutboundPromptTokenCount(1234)).toMatch(/1[,.]234/)
  })
})
