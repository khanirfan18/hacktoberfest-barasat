import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        noir: "#07090B",
        lime: "#C6FF3D",
        magenta: "#FF3DCB",
        cyan: "#3DE0FF",
        glass: "rgba(255,255,255,0.04)",
      },
      fontFamily: {
        display: ["var(--font-unbounded)"],
        sans: ["var(--font-manrope)"],
        mono: ["var(--font-jetbrains)"],
      },
    },
  },
  plugins: [],
};

export default config;
