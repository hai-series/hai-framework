import { defineConfig } from 'vitest/config'

export default defineConfig({
  envDir: false,
  test: {
    maxWorkers: 2,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**'],
  },
})
