/**
 * =============================================================================
 * hai Admin Console - Svelte 配置
 * =============================================================================
 */

import process from 'node:process'
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
    // 使用 trustedOrigins 取代已弃用的 checkOrigin
    // E2E 场景允许本地测试域名
    csrf: {
      trustedOrigins: process.env.HAI_E2E === '1'
        ? ['http://localhost:4173', 'http://127.0.0.1:4173']
        : [],
    },
    alias: {
      '$components': './src/lib/components',
      '$stores': './src/lib/stores',
      '$utils': './src/lib/utils',
      // 有 browser/node 双入口的包由 vite.config.ts 中的 haiResolvePlugin 条件解析
      '@h-ai/audit': '../../packages/audit/src/index.ts',
      '@h-ai/cache': '../../packages/cache/src/index.ts',
      '@h-ai/crypto': '../../packages/crypto/src/index.ts',
      '@h-ai/db': '../../packages/db/src/index.ts',
      '@h-ai/kit': '../../packages/kit/src/index.ts',
      '@h-ai/reach': '../../packages/reach/src/index.ts',
      '@h-ai/ui': '../../packages/ui/src/lib/index.ts',
      '@h-ai/ui/*': '../../packages/ui/*',
    },
  },
}

export default config
