import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    node: 'src/index.ts',
    browser: 'src/core-index.browser.ts',
  },
  external: ['yaml', 'pino', 'loglevel', 'nanoid'],
  noExternal: ['zod'],
})
