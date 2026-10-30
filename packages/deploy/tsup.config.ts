import { copyFileSync } from 'node:fs'
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'yaml', 'zod'],
  onSuccess: async () => {
    copyFileSync('src/container/deploy-runtime-env.mjs', 'dist/deploy-runtime-env.mjs')
  },
})
