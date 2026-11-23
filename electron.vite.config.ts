import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // The NDI Ambience worker (src/main/ndi-worker.ts) runs as a
        // UtilityProcess, so it needs its own built file beside the main
        // bundle — main forks it by path (out/main/ndi-worker.js).
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'ndi-worker': resolve(__dirname, 'src/main/ndi-worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react()]
  }
})