/** @type {import('tailwindcss').Config} */
export default {
  content: ["./web/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#1e1e1e",
        surface: "#252526",
        border: "#3c3c3c",
        accent: "#3794ff",
        muted: "#858585",
      },
    },
  },
  plugins: [],
};
