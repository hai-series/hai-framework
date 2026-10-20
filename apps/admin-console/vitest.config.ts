import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { adminBuildConfig } from './config-env.js'

export default defineConfig({
  envDir: false,
  define: { __ADMIN_KIT_CONFIG__: adminBuildConfig('test') },
  resolve: {
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**'],
  },
})
