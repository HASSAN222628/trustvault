import type { Config } from 'tailwindcss';

// Design tokens live in src/index.css as CSS variables; Tailwind maps them to names.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        ink: 'hsl(var(--ink) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        line: 'hsl(var(--line) / <alpha-value>)',
        rail: 'hsl(var(--rail) / <alpha-value>)',
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          strong: 'hsl(var(--accent-strong) / <alpha-value>)',
          soft: 'hsl(var(--accent-soft) / <alpha-value>)',
        },
        danger: { DEFAULT: 'hsl(var(--danger) / <alpha-value>)', soft: 'hsl(var(--danger-soft) / <alpha-value>)' },
        warn: { DEFAULT: 'hsl(var(--warn) / <alpha-value>)', soft: 'hsl(var(--warn-soft) / <alpha-value>)' },
        ok: { DEFAULT: 'hsl(var(--ok) / <alpha-value>)', soft: 'hsl(var(--ok-soft) / <alpha-value>)' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { md: '6px', lg: '8px' },
      boxShadow: { raised: '0 1px 2px rgb(16 24 32 / 0.06)', overlay: '0 12px 32px rgb(16 24 32 / 0.18)' },
    },
  },
} satisfies Config;
