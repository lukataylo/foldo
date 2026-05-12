/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#1e1e1e',
        panel: '#2c2c2c',
        panelMute: '#252525',
        hairline: '#3a3a3a',
        hairlineSoft: '#323232',
        ink: '#e8e8e8',
        inkMute: '#9a9a9a',
        inkFaint: '#6a6a6a',
        accent: '#ff7849',
        accentSoft: '#ff944f',
        warn: '#f5b86b',
        ok: '#7fd49a',
        markdown: '#f6f1ea',
        markdownInk: '#2a2622',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
      },
      boxShadow: {
        frame: '0 1px 0 rgba(0,0,0,0.4), 0 12px 32px -16px rgba(0,0,0,0.7)',
        panel: '0 24px 48px -12px rgba(0,0,0,0.6)',
        pin: '0 2px 6px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
