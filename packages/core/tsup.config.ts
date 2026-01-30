import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: ['yaml', 'pino', 'pino-pretty', 'loglevel'],
  noExternal: ['nanoid', 'zod'],
})
