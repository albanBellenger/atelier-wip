import { KNOWN_LLM_CALL_SOURCES, llmCallSourceLabel } from './llmCallSourceLabels'

describe('llmCallSourceLabels', () => {
  it('lists builder_composer_hint so usage Source filter matches token_usage rows', () => {
    expect(KNOWN_LLM_CALL_SOURCES).toContain('builder_composer_hint')
    expect(llmCallSourceLabel('builder_composer_hint')).toBe('Builder composer hint')
  })

  it('returns empty string for nullish keys so callers can chain safely', () => {
    expect(llmCallSourceLabel(undefined)).toBe('')
    expect(llmCallSourceLabel(null)).toBe('')
  })
})
