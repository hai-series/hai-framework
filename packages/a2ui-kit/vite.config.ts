import path from 'node:path'

import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve(__dirname, 'demo'),
  server: {
    port: 5182,
    open: false,
  },
  resolve: {
    alias: {
      '@h-ai/a2ui-kit-debug': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-demo'),
    emptyOutDir: true,
  },
})
