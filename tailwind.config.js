/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Every colour resolves through a CSS custom property declared in
      // src/index.css. Light/dark swap happens there once, so components never
      // carry `dark:` variants.
      colors: {
        plane: 'var(--plane)',
        surface: 'var(--surface-1)',
        raised: 'var(--surface-2)',
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        line: {
          grid: 'var(--gridline)',
          base: 'var(--baseline)',
          hair: 'var(--border-hair)',
        },
        series: {
          1: 'var(--series-1)',
          2: 'var(--series-2)',
          3: 'var(--series-3)',
          4: 'var(--series-4)',
          5: 'var(--series-5)',
        },
        status: {
          good: 'var(--status-good)',
          warning: 'var(--status-warning)',
          serious: 'var(--status-serious)',
          critical: 'var(--status-critical)',
        },
        wash: {
          good: 'var(--wash-good)',
          warning: 'var(--wash-warning)',
          serious: 'var(--wash-serious)',
          critical: 'var(--wash-critical)',
          accent: 'var(--wash-accent)',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
