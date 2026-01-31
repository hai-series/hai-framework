import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    index: 'src/core-index.node.ts',
    browser: 'src/core-index.browser.ts',
  },
  external: ['yaml', 'pino', 'pino-pretty', 'loglevel', 'nanoid'],
  noExternal: ['zod'],
})
