import { describe, expect, it } from 'vitest'

import { ATELIER_MENU_DOT_ICON } from './crepeCopilotMenus'

describe('ATELIER_MENU_DOT_ICON', () => {
  it('uses rect shapes so Crepe Icon DOMPurify does not strip children (circle is removed)', () => {
    expect(ATELIER_MENU_DOT_ICON).toContain('<rect')
    expect(ATELIER_MENU_DOT_ICON).not.toContain('<circle')
  })
})
