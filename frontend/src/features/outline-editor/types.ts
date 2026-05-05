export type OeAccentKey = 'violet' | 'indigo' | 'cyan' | 'lime' | 'amber'

export type OeEditorMode = 'preview' | 'split' | 'code' | 'context'

export type OeHealthKey = 'drift' | 'gap' | 'tok' | 'src'

export type OeCopilotTab = 'chat' | 'critique' | 'diff' | 'context' | 'sources'

export type OeBlockType = 'h2' | 'h3' | 'p' | 'ul' | 'ai-suggest'

export type OeBlock =
  | { id: string; type: 'h2'; text: string }
  | { id: string; type: 'h3'; text: string }
  | { id: string; type: 'p'; text: string }
  | { id: string; type: 'ul'; items: string[] }
  | {
      id: string
      type: 'ai-suggest'
      title: string
      originCmd: string
      additions: string[]
      rationale: string
    }

export type OeSection = {
  id: string
  num: number
  title: string
  slug: string
  status: 'ok' | 'warn'
  issueCount: number
}

export type OeContextItem = {
  id: string
  kind: string
  name: string
  tokens: number
  pinned?: boolean
  auto?: boolean
  conflict?: boolean
  drift?: boolean
}

export type OeContextGroup = {
  id: string
  title: string
  items: OeContextItem[]
}

export type OeThreadMsg =
  | {
      id: string
      role: 'user'
      text: string
    }
  | {
      id: string
      role: 'model'
      text: string
      refs?: { label: string; diffId: string }[]
    }

export type OeCritique = {
  id: string
  kind: 'gap' | 'drift'
  severity: 'high' | 'med' | 'low'
  text: string
}

export type OeSlash = { cmd: string; desc: string }

export type OeModel = { id: string; short: string; tag?: string }

export type OeSource = {
  id: string
  kind: string
  name: string
  ts: string
  missing?: boolean
}

export type OePendingDiff = {
  id: string
  title: string
  preview: string
  blockId?: string
}
