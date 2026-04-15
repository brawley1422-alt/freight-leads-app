import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#f6efe1",
        ink: "#1a1713",
        blood: "#c23b22",
        rust: "#8b2e1c",
        sand: "#e8dcc0",
        dust: "#8a7f6a",
      },
      fontFamily: {
        display: ['"Canela"', '"Playfair Display"', "ui-serif", "Georgia", "serif"],
        serif: ['"Source Serif 4"', "ui-serif", "Georgia", "serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
