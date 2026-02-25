import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    'browser': 'src/ai-index.browser.ts',
    'client/index': 'src/client/index.ts',
  },
  external: ['@h-ai/core', 'openai', '@modelcontextprotocol/sdk', 'zod'],
})
