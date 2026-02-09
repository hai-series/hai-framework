import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/client/ai-client.ts'],
  external: ['@hai/core', 'openai', '@modelcontextprotocol/sdk'],
})
