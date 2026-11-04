import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "#0e1621",
          sidebar: "#17212b",
          header: "#17212b",
          input: "#242f3d",
          blue: "#2AABEE",
          "blue-dark": "#229ED9",
          "message-out": "#2b5278",
          "message-in": "#182533",
          border: "#0e1621",
          text: "#f5f5f5",
          "text-secondary": "#7d8b99",
          hover: "#202b36",
          active: "#2b5278",
        },
      },
    },
  },
  plugins: [],
};

export default config;
