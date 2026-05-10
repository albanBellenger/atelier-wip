import type { MouseEvent, ReactElement } from 'react'

const BTN =
  'inline-flex shrink-0 cursor-help text-zinc-500 outline-none transition hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 rounded-full'

export type InfoCircleHelpButtonProps = {
  'aria-label': string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  /** Tailwind focus ring offset (surface behind the control). */
  ringOffsetClass?: string
}

/** Circle “i” glyph for help tooltips — same visual as the admin console month summary hint. */
export function InfoCircleHelpButton({
  'aria-label': ariaLabel,
  onClick,
  ringOffsetClass = 'focus-visible:ring-offset-[#0a0a0b]',
}: InfoCircleHelpButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`${BTN} ${ringOffsetClass}`}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1" />
        <circle cx="7" cy="4.35" r="0.55" fill="currentColor" />
        <path
          d="M7 6.1v4.15"
          stroke="currentColor"
          strokeWidth="1.05"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
