import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react'

export interface AiComposerPrefillContextValue {
  /** Prefill copilot composer (same as typing a leading slash command). */
  onAiComposerPrefill?: (markdown: string) => void
  /** When true, /replace from the selection bubble is disabled (focus layout). */
  replaceSelectionDisabled?: boolean
}

const AiComposerPrefillContext = createContext<AiComposerPrefillContextValue>(
  {},
)

export function AiComposerPrefillProvider(props: {
  value: AiComposerPrefillContextValue
  children: ReactNode
}): ReactElement {
  return (
    <AiComposerPrefillContext.Provider value={props.value}>
      {props.children}
    </AiComposerPrefillContext.Provider>
  )
}

export function useAiComposerPrefill(): AiComposerPrefillContextValue {
  return useContext(AiComposerPrefillContext)
}
