import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    maxWorkers: 2,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
