import { describe, expect, it, vi } from 'vitest'

import { crepeToolbarBuildAtelier } from './crepeToolbarAtelier'

describe('crepeToolbarBuildAtelier', () => {
  it('clears Crepe defaults then registers grouped block, style, insert, and compact Copilot items', () => {
    const clear = vi.fn()
    const itemKeys: string[] = []
    const addItem = vi.fn((key: string) => {
      itemKeys.push(key)
    })
    const addGroup = vi.fn(() => ({ addItem }))
    const builder = { clear, addGroup }
    crepeToolbarBuildAtelier(() => ({}))(builder)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(addGroup).toHaveBeenNthCalledWith(1, 'atelier-block', 'Block')
    expect(addGroup).toHaveBeenNthCalledWith(2, 'atelier-style', 'Style')
    expect(addGroup).toHaveBeenNthCalledWith(3, 'atelier-insert', 'Insert')
    expect(addGroup).toHaveBeenNthCalledWith(4, 'atelier-copilot', 'Copilot')
    expect(itemKeys).toEqual([
      'atelier-block-text',
      'atelier-block-h1',
      'atelier-block-h2',
      'atelier-block-h3',
      'atelier-style-bold',
      'atelier-style-italic',
      'atelier-style-strike',
      'atelier-insert-code',
      'atelier-insert-link',
      'atelier-copilot-replace',
      'atelier-copilot-improve',
      'atelier-copilot-append',
    ])
  })
})
