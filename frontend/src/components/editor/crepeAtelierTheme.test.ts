import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('crepeAtelierTheme', () => {
  it('stylesheet exists and CrepeEditor imports it after Crepe theme CSS', () => {
    const themePath = join(__dirname, 'crepeAtelierTheme.css')
    const css = readFileSync(themePath, 'utf8')
    expect(css.length).toBeGreaterThan(0)
    expect(css).toContain('.crepe-atelier-host')

    const editorPath = join(__dirname, 'CrepeEditor.tsx')
    const editorSrc = readFileSync(editorPath, 'utf8')
    expect(editorSrc).toMatch(/['"]\.\/crepeAtelierTheme\.css['"]/)
    const crepeCommonIdx = editorSrc.indexOf('@milkdown/crepe/theme/common/style.css')
    const crepeFrameIdx = editorSrc.indexOf('@milkdown/crepe/theme/frame-dark.css')
    const proseIdx = editorSrc.indexOf('@milkdown/kit/prose/view/style/prosemirror.css')
    const atelierIdx = editorSrc.indexOf('./crepeAtelierTheme.css')
    expect(crepeCommonIdx).toBeGreaterThanOrEqual(0)
    expect(crepeFrameIdx).toBeGreaterThan(crepeCommonIdx)
    expect(proseIdx).toBeGreaterThan(crepeFrameIdx)
    expect(atelierIdx).toBeGreaterThan(proseIdx)
  })
})
