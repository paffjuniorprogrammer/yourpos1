/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          500: "#2563EB",
          600: "#1D4ED8",
          700: "#1E40AF"
        },
        ink: "#0F172A",
        canvas: "#F9FAFB"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(15, 23, 42, 0.08)"
      },
      fontFamily: {
        sans: ["'Segoe UI'", "system-ui", "sans-serif"]
      },
      fontSize: {
        /* Responsive font sizes using CSS custom properties */
        'xs': 'var(--font-xs, 0.75rem)',
        'sm': 'var(--font-sm, 0.875rem)',
        'base': 'var(--font-base, 1rem)',
        'lg': 'var(--font-lg, 1.125rem)',
        'xl': 'var(--font-xl, 1.25rem)',
        '2xl': 'var(--font-2xl, 1.5rem)',
        '3xl': 'var(--font-3xl, 1.875rem)',
        '4xl': 'var(--font-4xl, 2.25rem)',
        '5xl': 'var(--font-5xl, 3rem)',
      }
    }
  },
  plugins: []
};
