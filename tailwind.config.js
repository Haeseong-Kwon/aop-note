/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem'
    },
    extend: {
      colors: {
        // Translucent so dividers read as hairlines on glass instead of hard rules.
        // Light glass needs a higher alpha than dark to stay visible at all.
        border: 'hsl(var(--border) / var(--border-alpha))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        // The active desk's colour (falls back to the app accent outside a desk).
        desk: 'hsl(var(--desk, var(--primary)) / <alpha-value>)'
      },
      // Motion tokens: quick, decelerating — the UI answers, it doesn't perform.
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)'
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '260ms'
      },
      keyframes: {
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.97)' },
          to: { opacity: '1', transform: 'none' }
        },
        'view-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' }
        },
        'check-pop': {
          '0%': { transform: 'scale(0.6)' },
          '60%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' }
        },
        'check-draw': {
          from: { strokeDashoffset: '16' },
          to: { strokeDashoffset: '0' }
        }
      },
      animation: {
        'pop-in': 'pop-in 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        'view-in': 'view-in 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'check-pop': 'check-pop 260ms cubic-bezier(0.34, 1.4, 0.64, 1)',
        'check-draw': 'check-draw 220ms 60ms cubic-bezier(0.22, 1, 0.36, 1) both'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')]
}
