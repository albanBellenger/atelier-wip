import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

export type TopBarRenamePatch = {
  title?: string
  slug?: string | null
}

export type TopBarRenameHandlers = {
  isSaving: boolean
  onSave: (patch: TopBarRenamePatch) => Promise<void>
}

export function TopBar(props: {
  title: string
  slug: string
  trailing?: ReactElement | null
  rename?: TopBarRenameHandlers
}): ReactElement {
  const { title, slug, trailing, rename } = props
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftSlug, setDraftSlug] = useState(slug)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) {
      setDraftTitle(title)
      setDraftSlug(slug)
    }
  }, [title, slug, editing])

  const openEdit = (): void => {
    setDraftTitle(title)
    setDraftSlug(slug)
    setSaveError(null)
    setEditing(true)
  }

  const cancelEdit = (): void => {
    setSaveError(null)
    setEditing(false)
    setDraftTitle(title)
    setDraftSlug(slug)
  }

  const submitRename = async (): Promise<void> => {
    if (!rename) {
      return
    }
    const nextTitle = draftTitle.trim()
    if (nextTitle.length === 0) {
      setSaveError('Title is required.')
      return
    }
    setSaveError(null)
    const slugTrim = draftSlug.trim().toLowerCase()
    if (slugTrim.length === 0) {
      setSaveError('Slug cannot be empty.')
      return
    }
    const patch: TopBarRenamePatch = {}
    if (nextTitle !== title) {
      patch.title = nextTitle
    }
    if (slugTrim !== slug) {
      patch.slug = slugTrim
    }
    if (Object.keys(patch).length === 0) {
      return
    }
    try {
      await rename.onSave(patch)
      setEditing(false)
    } catch {
      setSaveError('Could not save changes.')
    }
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#08080a]/90 px-4 py-3 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {!editing ? (
          <>
            <div className="flex min-w-0 items-start gap-2">
              <h1 className="min-w-0 flex-1 truncate font-display text-lg font-medium tracking-tight text-zinc-100">
                {title}
              </h1>
              {rename ? (
                <button
                  type="button"
                  data-testid="topbar-rename-open"
                  className="shrink-0 rounded px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  onClick={openEdit}
                >
                  Rename
                </button>
              ) : null}
            </div>
            <span className="font-mono text-[11px] text-zinc-500">{slug}</span>
          </>
        ) : (
          <div className="flex min-w-0 max-w-xl flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="topbar-rename-title-input"
                className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
              >
                Title
              </label>
              <input
                id="topbar-rename-title-input"
                data-testid="topbar-rename-title"
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                autoComplete="off"
                disabled={rename?.isSaving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="topbar-rename-slug-input"
                className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
              >
                Slug
              </label>
              <input
                id="topbar-rename-slug-input"
                data-testid="topbar-rename-slug"
                type="text"
                value={draftSlug}
                onChange={(e) => setDraftSlug(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                autoComplete="off"
                disabled={rename?.isSaving}
              />
            </div>
            {saveError ? (
              <p className="text-[11px] text-rose-400">{saveError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="topbar-rename-save"
                className="rounded bg-violet-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                disabled={rename?.isSaving}
                onClick={() => void submitRename()}
              >
                {rename?.isSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                data-testid="topbar-rename-cancel"
                className="rounded border border-zinc-700 px-3 py-1 text-[12px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                disabled={rename?.isSaving}
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  )
}
