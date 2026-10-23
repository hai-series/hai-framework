import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  test: {
    maxWorkers: 2,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**'],
  },
})
