module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}", // adjust paths to match your project structure
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel2': 'var(--panel2)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        dim: 'var(--dim)',
        text: 'var(--text)',
      },
    },
  },
  plugins: [],
}