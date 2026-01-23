import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'header-bg': '#111827',
        'coach-accent': '#d4af37',
        'coach-primary': '#0ea5e9',
        'muted': '#6b7280',
      },
    },
  },
  plugins: [],
}
export default config
