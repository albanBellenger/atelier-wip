import { commandsCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { describe, expect, it, vi } from 'vitest'

import { BLOCK_MENU_ITEMS } from './slashBlockActions'

describe('slashBlockActions', () => {
  it('each block item invokes commandsCtx.call', () => {
    const call = vi.fn()
    const mockCtx = {
      get: (token: unknown) => {
        expect(token).toBe(commandsCtx)
        return { call }
      },
    } as unknown as Ctx
    for (const item of BLOCK_MENU_ITEMS) {
      call.mockClear()
      item.run(mockCtx)
      expect(call).toHaveBeenCalledTimes(1)
    }
  })
})
