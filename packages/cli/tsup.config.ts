import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: ['@h-ai/core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
