/**
 * =============================================================================
 * hai Admin Console - Svelte 配置
 * =============================================================================
 */

import { autoImportHaiUi } from '@hai/ui/auto-import'
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
      '@hai/ai': '../../packages/ai',
      '@hai/cache': '../../packages/cache',
      '@hai/core': '../../packages/core',
      '@hai/crypto': '../../packages/crypto',
      '@hai/db': '../../packages/db',
      '@hai/iam': '../../packages/iam',
      '@hai/kit': '../../packages/kit',
      '@hai/storage': '../../packages/storage',
      '@hai/ui': '../../packages/ui',
      '@hai/ui/*': '../../packages/ui/*',
    },
  },
}

export default config
