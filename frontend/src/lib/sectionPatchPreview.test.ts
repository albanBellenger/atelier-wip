import { describe, expect, it } from 'vitest'

import {
  previewAfterAppend,
  previewAfterEdit,
  previewAfterReplace,
  summarizeTextChange,
} from './sectionPatchPreview'

describe('sectionPatchPreview', () => {
  it('previewAfterAppend adds separator when snapshot has no trailing newline', () => {
    expect(previewAfterAppend('a', 'b')).toBe('a\n\nb')
  })

  it('previewAfterAppend uses no extra sep when snapshot ends with newline', () => {
    expect(previewAfterAppend('a\n', 'b')).toBe('a\nb')
  })

  it('previewAfterReplace splices using selected plaintext', () => {
    expect(previewAfterReplace('hello world', 'H', 'hello')).toBe('H world')
  })

  it('previewAfterEdit replaces first occurrence only', () => {
    expect(previewAfterEdit('aa', 'a', 'b')).toBe('ba')
  })

  it('summarizeTextChange reports differing lines', () => {
    const lines = summarizeTextChange('a\nb', 'a\nc', 10)
    expect(lines.some((l) => l.includes('- b'))).toBe(true)
    expect(lines.some((l) => l.includes('+ c'))).toBe(true)
  })
})
