import type { Config } from 'tailwindcss';

// Colors/radius mirror the CSS custom properties in globals.css — single
// source of truth, see docs/DESIGN_SYSTEM.md §2/§4. Never hardcode a hex
// value in a component; extend this file (and globals.css) instead.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'on-dark': 'var(--on-dark)',
        'on-dark-muted': 'var(--on-dark-muted)',
        indigo: 'var(--indigo)',
        amber: 'var(--amber)',
        emerald: 'var(--emerald)',
        border: 'var(--border)',
        'emerald-soft': 'var(--emerald-soft)',
        'emerald-strong': 'var(--emerald-strong)',
        'amber-soft': 'var(--amber-soft)',
        'amber-strong': 'var(--amber-strong)',
        'ink-soft': 'var(--ink-soft)',
        'cat-indigo': 'var(--cat-indigo)',
        'cat-amber': 'var(--cat-amber)',
        'cat-emerald': 'var(--cat-emerald)',
        'cat-rose': 'var(--cat-rose)',
        'cat-orange': 'var(--cat-orange)',
        'cat-teal': 'var(--cat-teal)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        card: 'var(--radius)',
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
