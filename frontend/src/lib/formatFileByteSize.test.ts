import { describe, expect, it } from 'vitest'

import { formatFileByteSize } from './formatFileByteSize'

describe('formatFileByteSize', () => {
  it('formats bytes and KB', () => {
    expect(formatFileByteSize(0)).toBe('0 B')
    expect(formatFileByteSize(512)).toBe('512 B')
    expect(formatFileByteSize(1024)).toBe('1 KB')
    expect(formatFileByteSize(3277)).toMatch(/3\.2 KB/)
  })

  it('formats MB', () => {
    expect(formatFileByteSize(1_470_000)).toMatch(/1\.4 MB/)
  })
})
