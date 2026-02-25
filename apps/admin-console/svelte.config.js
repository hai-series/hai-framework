/**
 * =============================================================================
 * hai Admin Console - Svelte 配置
 * =============================================================================
 */

import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    // 强制使用 Svelte 5 Runes
    runes: true,
  },
  kit: {
    adapter: adapter(),
    alias: {
      '$components': './src/lib/components',
      '$stores': './src/lib/stores',
      '$utils': './src/lib/utils',
      '@h-ai/ai': '../../packages/ai',
      '@h-ai/cache': '../../packages/cache',
      '@h-ai/core': '../../packages/core',
      '@h-ai/crypto': '../../packages/crypto',
      '@h-ai/db': '../../packages/db',
      '@h-ai/iam': '../../packages/iam',
      '@h-ai/kit': '../../packages/kit',
      '@h-ai/storage': '../../packages/storage',
      '@h-ai/ui': '../../packages/ui/src/lib/index.ts',
      '@h-ai/ui/*': '../../packages/ui/*',
    },
  },
}

export default config
