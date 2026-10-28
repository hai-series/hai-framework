import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { resolveBuildMetadata } from './scripts/build-metadata.js'

export default defineConfig({
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  define: { __HAI_BUILD_METADATA__: JSON.stringify(resolveBuildMetadata(fileURLToPath(new URL('.', import.meta.url)))) },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**'],
  },
})
