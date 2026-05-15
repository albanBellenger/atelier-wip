import type { Node as ProseNode } from '@milkdown/prose/model'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { EditorView } from '@milkdown/prose/view'
import { $prose } from '@milkdown/utils'

import {
  collectHeadingStartPositions,
  headingPositionForIndex,
  type IssueGutterMark,
} from './issueGutterSpec'

/** ProseMirror plugin state: gutter decorations for gap/conflict issues. */
export const issueGutterDecorationKey = new PluginKey<DecorationSet>('atelier_issue_gutter_deco_v1')

/** Set on a transaction to force rebuilding gutter decorations from `getMarks()`. */
export const issueGutterRefreshKey = new PluginKey<boolean>('atelier_issue_gutter_refresh_v1')

function createGutterWidgetElement(mark: IssueGutterMark): HTMLElement {
  const el = document.createElement('span')
  el.className =
    mark.variant === 'gap'
      ? 'crepe-issue-gutter-icon crepe-issue-gutter-icon--gap'
      : 'crepe-issue-gutter-icon crepe-issue-gutter-icon--conflict'
  el.dataset.issueId = mark.issueId
  el.setAttribute('role', 'img')
  el.setAttribute(
    'aria-label',
    mark.variant === 'gap' ? 'Section gap issue' : 'Conflict issue',
  )
  el.textContent = mark.variant === 'gap' ? 'G' : 'C'
  return el
}

/** Builds a decoration set for the current document and issue marks (exported for tests). */
export function buildIssueGutterDecorationSet(
  doc: ProseNode,
  marks: readonly IssueGutterMark[],
): DecorationSet {
  const headingStarts = collectHeadingStartPositions(doc)
  const decorations: Decoration[] = []
  for (const m of marks) {
    const pos = headingPositionForIndex(headingStarts, m.headingIndex)
    if (pos == null) {
      continue
    }
    decorations.push(
      Decoration.widget(pos, createGutterWidgetElement(m), {
        side: -1,
        key: `atelier-issue-${m.issueId}`,
      }),
    )
  }
  return DecorationSet.create(doc, decorations)
}

export function dispatchIssueGutterRefresh(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(issueGutterRefreshKey, true))
}

/**
 * Milkdown plugin: left-gutter widgets for gap/conflict issues at heading anchors.
 * `getMarks` is read whenever the document changes or `dispatchIssueGutterRefresh` runs.
 */
export function createIssueGutterMilkdownPlugin(
  getMarks: () => readonly IssueGutterMark[],
): ReturnType<typeof $prose> {
  return $prose(() => {
    return new Plugin<DecorationSet>({
      key: issueGutterDecorationKey,
      state: {
        init(_, state) {
          return buildIssueGutterDecorationSet(state.doc, getMarks())
        },
        apply(tr, set, _old, newState) {
          if (tr.docChanged || tr.getMeta(issueGutterRefreshKey) === true) {
            return buildIssueGutterDecorationSet(newState.doc, getMarks())
          }
          return set.map(tr.mapping, newState.doc)
        },
      },
      props: {
        decorations(state) {
          return issueGutterDecorationKey.getState(state) ?? DecorationSet.empty
        },
      },
    })
  })
}
