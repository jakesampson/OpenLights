import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  // The app builds with the automatic JSX runtime (electron-vite), so
  // .tsx sources and tests must transform the same way here — without
  // this esbuild falls back to the classic runtime and every JSX file
  // fails with "React is not defined".
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  }
})