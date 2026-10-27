/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--cc-bg)", surface: "var(--cc-surface)", fg: "var(--cc-fg)", muted: "var(--cc-muted)",
        line: "var(--cc-line)", primary: "#c52a35", "primary-fg": "#ffffff",
        danger: "var(--cc-danger)",
      },
      boxShadow: { card: "0 10px 30px rgba(40, 20, 20, 0.045)" },
      fontFamily: { sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
