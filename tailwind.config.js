/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--cc-bg)", surface: "var(--cc-surface)", fg: "var(--cc-fg)", muted: "var(--cc-muted)",
        line: "var(--cc-line)", primary: "var(--cc-primary)", "primary-fg": "var(--cc-primary-fg)",
        danger: "var(--cc-danger)",
      },
      fontFamily: { sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
