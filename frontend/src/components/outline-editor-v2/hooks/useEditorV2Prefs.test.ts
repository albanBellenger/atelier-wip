import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useEditorV2Prefs } from '../hooks/useEditorV2Prefs'

describe('useEditorV2Prefs', () => {
  afterEach(() => {
    localStorage.removeItem('atelier:userEditorPrefs')
  })

  it('persists outlineEditorV2 to localStorage', () => {
    localStorage.clear()
    const { result } = renderHook(() => useEditorV2Prefs())
    expect(result.current.outlineEditorV2).toBe(false)

    act(() => {
      result.current.setOutlineEditorV2(true)
    })
    expect(result.current.outlineEditorV2).toBe(true)
    expect(localStorage.getItem('atelier:userEditorPrefs')).toContain(
      '"outlineEditorV2":true',
    )
  })
})
