import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { useStream } from './useStream'

describe('useStream', () => {
  it('delegates to streamPrivateThreadReply with the same handlers object', async () => {
    const spy = vi
      .spyOn(api, 'streamPrivateThreadReply')
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => useStream())
    const handlers = {
      onToken: vi.fn(),
      onMeta: vi.fn(),
    }
    const payload: api.PrivateThreadStreamPayload = {
      content: 'hello',
    }
    await result.current.streamPrivateThread('p1', 'sec-1', payload, handlers)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('p1', 'sec-1', payload, handlers)
    spy.mockRestore()
  })

  it('returns a stable streamPrivateThread callback across rerenders', () => {
    const { result, rerender } = renderHook(() => useStream())
    const first = result.current.streamPrivateThread
    rerender()
    expect(result.current.streamPrivateThread).toBe(first)
  })
})
