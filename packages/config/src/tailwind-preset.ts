import type { Config } from "tailwindcss";

/**
 * Shared Tailwind preset. Portal chrome uses these tokens; partner branding is
 * injected at runtime as CSS variables (--brand-primary / --brand-secondary) so
 * one build serves every white-label tenant.
 */
const preset: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand-primary) / <alpha-value>)",
          primary: "rgb(var(--brand-primary) / <alpha-value>)",
          secondary: "rgb(var(--brand-secondary) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          muted: "rgb(var(--surface-muted) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
        },
        edge: "rgb(var(--edge) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
        },
        positive: "rgb(var(--positive) / <alpha-value>)",
        caution: "rgb(var(--caution) / <alpha-value>)",
        critical: "rgb(var(--critical) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)",
      },
    },
  },
  plugins: [],
};

export default preset;
