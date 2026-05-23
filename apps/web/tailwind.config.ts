import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        panel: "hsl(var(--panel))",
        "panel-strong": "hsl(var(--panel-strong))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
      },
      borderRadius: {
        control: "0.55rem",
        panel: "1rem",
        section: "1.2rem",
      },
      boxShadow: {
        card: "0 1.2rem 3rem hsl(var(--shadow) / 0.14)",
        soft: "0 0.8rem 2rem hsl(var(--shadow) / 0.1)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.08), 0 1rem 2.4rem hsl(var(--primary) / 0.14)",
      },
      keyframes: {
        "fade-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(14px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "pulse-soft": {
          "0%, 100%": {
            opacity: "0.62",
          },
          "50%": {
            opacity: "1",
          },
        },
      },
      animation: {
        "fade-up": "fade-up 560ms ease-out both",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
