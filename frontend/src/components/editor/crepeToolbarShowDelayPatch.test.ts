import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const patchPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../patches/@milkdown+crepe+7.21.0.patch',
)

describe('@milkdown/crepe toolbar first-show delay patch', () => {
  it('documents the patch and keeps delay within 250–400 ms', () => {
    const text = readFileSync(patchPath, 'utf8')
    expect(text).toContain('shouldShowCrepeToolbar')
    expect(text).toContain('ATELIER_CREPE_TOOLBAR_SHOW_DELAY_MS = 320')
  })
})
