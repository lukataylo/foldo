/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/popup/index.html', './src/options/index.html', './src/**/*.{ts,tsx}'],
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
        err: '#ef6b6b',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
