import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'yaml'],
  metafile: true,
  noExternal: ['@h-ai/reldb/schemas', /^zod(?:\/.*)?$/],
  banner: { js: '#!/usr/bin/env node' },
})
