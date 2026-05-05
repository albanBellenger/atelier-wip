import type { Config } from 'tailwindcss'

/** Aligns with `@theme` in `src/index.css`; keeps `font-display` discoverable for tooling. */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'Inter', 'serif'],
      },
    },
  },
} satisfies Config
