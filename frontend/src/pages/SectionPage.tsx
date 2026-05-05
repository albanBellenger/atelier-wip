import type { ReactElement } from 'react'

import { OutlineEditorV2 } from '../components/outline-editor-v2'
import { useEditorV2Prefs } from '../components/outline-editor-v2/hooks/useEditorV2Prefs'
import { SectionPageV1 } from './SectionPageV1'

/** Section route: V1 split editor by default; optional V2 outline editor from user prefs. */
export function SectionPage(): ReactElement {
  const prefs = useEditorV2Prefs()
  return prefs.outlineEditorV2 ? <OutlineEditorV2 /> : <SectionPageV1 />
}
