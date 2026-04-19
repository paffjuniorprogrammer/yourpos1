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
      }
    }
  },
  plugins: []
};
