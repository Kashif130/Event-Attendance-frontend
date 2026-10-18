/** @type {import('tailwindcss').Config} */
// Graphite with a merge-purple accent (the colour GitHub uses for a merged pull request).
// Token roles: deep = surfaces (950 page, 900 card, 600 borders), mist = text (100 strongest),
// beacon = accent (primary actions), jade = verified, amber = pending/warning, ember = rejected.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deep: { 950: "#0D0E14", 900: "#14151D", 850: "#1A1B26", 800: "#212230", 700: "#2F3144", 600: "#484B66" },
        mist: { 100: "#ECEAF4", 200: "#D3D1E0", 400: "#A09EB8", 500: "#7C7A96", 600: "#5A5872" },
        beacon: { 200: "#E0D4FF", 300: "#C7B0FF", 400: "#A98BFF", 500: "#8A67F0", 600: "#6A47C9" },
        jade: { 400: "#6DD3A5", 500: "#4FBF8E", 600: "#3A9C74" },
        amber: { 300: "#F7A972", 400: "#F28F4F", 500: "#D9733A" },
        ember: { 400: "#F0786A", 500: "#E0584A", 600: "#B8433A" },
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "system-ui", "sans-serif"],
        sans: ["'Instrument Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        sheet: "0 1px 0 0 rgba(236,234,244,0.05) inset, 0 18px 36px -22px rgba(0,0,0,0.65)",
      },
      backgroundImage: {
        grain: "radial-gradient(circle at 1px 1px, rgba(236,234,244,0.04) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};
