import type { ReactElement } from 'react'

import type { PatchProposalMeta } from '../../lib/sectionPatchApply'

export function AssistantProposalCard(props: {
  patchProposal: PatchProposalMeta
  patchPreviewLines: string[]
  applyPatchBlocked: string | null
  applyErr: string | null
  applyPatchEnabled: boolean
  onApplyPatch: () => void
  onDismissPatch: () => void
  onViewPatchDiff: () => void
}): ReactElement {
  const {
    patchProposal,
    patchPreviewLines,
    applyPatchBlocked,
    applyErr,
    applyPatchEnabled,
    onApplyPatch,
    onDismissPatch,
    onViewPatchDiff,
  } = props
  return (
    <div className="mt-2 border-t border-violet-900/30 pt-2 text-xs text-zinc-200">
      <p className="font-medium text-violet-200">Patch proposal</p>
      {'error' in patchProposal && patchProposal.error ? (
        <p className="mt-1 text-red-300">{patchProposal.error}</p>
      ) : (
        <>
          {patchPreviewLines.length > 0 && (
            <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950/80 p-2 text-[11px] text-zinc-400">
              {patchPreviewLines.join('\n')}
            </pre>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                !applyPatchEnabled ||
                ('error' in patchProposal && Boolean(patchProposal.error))
              }
              title={applyPatchBlocked ?? undefined}
              className="rounded bg-violet-600 px-2 py-1 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              onClick={() => onApplyPatch()}
            >
              Apply to editor
            </button>
            <button
              type="button"
              className="rounded border border-zinc-600 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
              onClick={() => onViewPatchDiff()}
            >
              Diff
            </button>
            <button
              type="button"
              className="rounded border border-zinc-600 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
              onClick={() => onDismissPatch()}
            >
              Dismiss
            </button>
          </div>
        </>
      )}
      {applyPatchBlocked != null && (
        <p className="mt-1 text-amber-200/90">{applyPatchBlocked}</p>
      )}
      {applyErr && <p className="mt-1 text-red-300">{applyErr}</p>}
    </div>
  )
}
