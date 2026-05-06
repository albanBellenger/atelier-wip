import type { ReactElement } from 'react'

import { useAdminLlmModelSuggestions } from '../../hooks/useAdminLlmModelSuggestions'

export function LlmModelSuggestInput({
  id,
  listId,
  value,
  onChange,
  providerKey,
  litellmProvider,
  placeholder,
  className,
  disabled,
  prefetch = false,
  minChars = 2,
  mode = 'chat',
  source = 'catalog',
}: {
  id: string
  listId: string
  value: string
  onChange: (next: string) => void
  providerKey?: string | null
  litellmProvider?: string | null
  placeholder?: string
  className?: string
  disabled?: boolean
  prefetch?: boolean
  minChars?: number
  mode?: 'chat' | 'embedding'
  source?: 'auto' | 'catalog' | 'upstream'
}): ReactElement {
  const q = useAdminLlmModelSuggestions({
    q: value,
    providerKey,
    litellmProvider,
    mode,
    source,
    prefetch,
    minChars,
    enabled: !disabled,
  })

  const models = q.data?.models ?? []

  return (
    <>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        className={className}
      />
      <datalist id={listId}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label ?? m.id}
          </option>
        ))}
      </datalist>
    </>
  )
}
