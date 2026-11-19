module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}", // adjust paths to match your project structure
  ],
  theme: {
    extend: {
      // Every theme colour carries Tailwind's `<alpha-value>` placeholder so
      // opacity-modified utilities (`bg-bg/30`, `border-line/40`, ...) actually
      // generate rules. Before this fix the colours were plain `var(--bg)`,
      // so Tailwind v3.4 generated no `bg-bg/NN` utility at all and every
      // such class silently painted nothing (first seen on the Project
      // Browser overlay, commit 0d496cc — the overlay went transparent).
      //
      // The colours are expressed with `color-mix()` rather than the usual
      // `rgb(var(--bg-rgb) / <alpha-value>)` form, deliberately: the CSS
      // variables hold a hex colour by default (`#2a1233`) and an `hsl(...)`
      // colour in adaptive mode (`index.css`, `:root[data-adaptive="true"]`),
      // and there is no RGB-triplet variable to feed the `rgb()` form.
      // `color-mix(in srgb, var(--bg) <pct>, transparent)` works off any
      // colour value the variable holds, so the default and adaptive themes
      // both keep working with no `index.css` change, and no colour value
      // changes here — only the alpha mechanism. Bare utilities
      // (`bg-bg`, `text-dim`) substitute `<alpha-value>` with 1, so they
      // still render exactly as before. `color-mix` needs Chromium 111+;
      // the app runs on Electron 31 (Chromium 126).
      colors: {
        bg: 'color-mix(in srgb, var(--bg) calc(<alpha-value> * 100%), transparent)',
        panel: 'color-mix(in srgb, var(--panel) calc(<alpha-value> * 100%), transparent)',
        'panel2': 'color-mix(in srgb, var(--panel2) calc(<alpha-value> * 100%), transparent)',
        line: 'color-mix(in srgb, var(--line) calc(<alpha-value> * 100%), transparent)',
        accent: 'color-mix(in srgb, var(--accent) calc(<alpha-value> * 100%), transparent)',
        dim: 'color-mix(in srgb, var(--dim) calc(<alpha-value> * 100%), transparent)',
        text: 'color-mix(in srgb, var(--text) calc(<alpha-value> * 100%), transparent)',
      },
    },
  },
  plugins: [],
}
