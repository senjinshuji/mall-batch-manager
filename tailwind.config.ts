import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        amazon: "#FF9900",
        rakuten: "#BF0000",
        qoo10: "#3266CC",
      },
    },
  },
  plugins: [],
};
export default config;
