/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0a0908', 900: '#13110f', 800: '#1c1a17', 700: '#26231f', 600: '#3a3631' },
        paper: { DEFAULT: '#f4ede0', dim: '#bdb6a8', muted: '#857f74' },
        phosphor: '#9eff4a',
        amber: '#ffb000',
        rust: '#c1440e',
        magenta: '#ff3d7f',
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.025em',
        caps: '0.16em',
      },
    },
  },
  plugins: [],
};
