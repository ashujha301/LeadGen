import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#121826",
        surface: {
          DEFAULT: "#1e293b",
          raised: "#232b3e",
        },
        accent: {
          DEFAULT: "#14b8a6",
          light: "#2dd4bf",
        },
        muted: "#9ca3af",
      },
      fontFamily: {
        sans: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
