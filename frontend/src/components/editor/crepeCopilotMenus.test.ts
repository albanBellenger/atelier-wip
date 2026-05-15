import { describe, expect, it, vi } from 'vitest'

import { AI_MENU_ITEM_IDS } from '../../lib/aiMenuActions'
import { setCrepeBlockHandleAddMenuSession } from './crepeBlockAddMenuScope'
import {
  ATELIER_MENU_DOT_ICON,
  copilotSlashMenuLabel,
  copilotSlashMenuShortcutHint,
  crepeBlockEditBuildMenu,
} from './crepeCopilotMenus'

describe('ATELIER_MENU_DOT_ICON', () => {
  it('uses rect shapes so Crepe Icon DOMPurify does not strip children (circle is removed)', () => {
    expect(ATELIER_MENU_DOT_ICON).toContain('<rect')
    expect(ATELIER_MENU_DOT_ICON).not.toContain('<circle')
  })
})

describe('copilotSlashMenuLabel', () => {
  it('embeds substrings Crepe slash filter uses (case-insensitive includes across all menu groups)', () => {
    for (const id of AI_MENU_ITEM_IDS) {
      const label = copilotSlashMenuLabel(id).toLowerCase()
      expect(label, id).toContain('ai')
      expect(label, id).toContain('section')
      expect(label, id).toContain('copilot')
    }
  })

  it('keeps the primary Copilot action token in the label for each known id', () => {
    expect(copilotSlashMenuLabel('append')).toMatch(/^Copilot: append\b/)
    expect(copilotSlashMenuLabel('improve')).toMatch(/^Copilot: improve\b/)
  })
})

describe('copilotSlashMenuShortcutHint', () => {
  it('gives every AI slash menu id a composer-style / hint', () => {
    for (const id of AI_MENU_ITEM_IDS) {
      const h = copilotSlashMenuShortcutHint(id)
      expect(h.startsWith('/')).toBe(true)
      expect(h.length).toBeGreaterThan(1)
    }
  })
})

describe('crepeBlockEditBuildMenu', () => {
  it('does not clear the group builder for slash menu (Copilot group only)', () => {
    setCrepeBlockHandleAddMenuSession(false)
    const clear = vi.fn()
    const addItem = vi.fn()
    const addGroup = vi.fn(() => ({ addItem }))
    crepeBlockEditBuildMenu(() => ({}))({ clear, addGroup })
    expect(clear).not.toHaveBeenCalled()
    expect(addGroup).toHaveBeenCalledWith('atelier-copilot', 'Copilot')
    expect(addItem).toHaveBeenCalledTimes(6)
    setCrepeBlockHandleAddMenuSession(false)
  })

  it('clears defaults and registers a short block-handle + menu', () => {
    setCrepeBlockHandleAddMenuSession(true)
    const clear = vi.fn()
    const itemKeys: string[] = []
    const addItem = vi.fn((key: string) => {
      itemKeys.push(key)
    })
    const addGroup = vi.fn(() => ({ addItem }))
    crepeBlockEditBuildMenu(() => ({}))({ clear, addGroup })
    expect(clear).toHaveBeenCalledTimes(1)
    expect(addGroup).toHaveBeenCalledWith('atelier-quick-insert', 'Insert')
    expect(itemKeys).toEqual([
      'atelier-quick-text',
      'atelier-quick-h2',
      'atelier-quick-bullet',
      'atelier-quick-code',
      'atelier-ai-append',
    ])
    setCrepeBlockHandleAddMenuSession(false)
  })
})
