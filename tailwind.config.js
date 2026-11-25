/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--cc-bg)", surface: "var(--cc-surface)", fg: "var(--cc-fg)", muted: "var(--cc-muted)",
        line: "var(--cc-line)", primary: "var(--cc-primary)", "primary-fg": "var(--cc-primary-fg)",
        "primary-hover": "var(--cc-primary-hover)", "primary-deep": "rgb(var(--cc-primary-deep-rgb) / <alpha-value>)",
        "primary-soft": "var(--cc-primary-soft)", "primary-tint": "var(--cc-primary-tint)",
        "primary-border": "var(--cc-primary-border)", danger: "var(--cc-danger)",
        "danger-soft": "var(--cc-danger-soft)", "danger-border": "var(--cc-danger-border)",
        success: "var(--cc-success)", "success-soft": "var(--cc-success-soft)", "success-border": "var(--cc-success-border)",
        warning: "var(--cc-warning)", "warning-soft": "var(--cc-warning-soft)", "warning-border": "var(--cc-warning-border)",
      },
      fontFamily: { sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
