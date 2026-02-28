import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: ['@h-ai/core', 'yaml'],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
