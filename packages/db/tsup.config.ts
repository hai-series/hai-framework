import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@hai/core', 'better-sqlite3', 'pg', 'mysql2'],
})
