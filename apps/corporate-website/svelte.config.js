/**
 * 企业官网 - Svelte 配置
 */
import process from 'node:process'
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    runes: true,
  },
  kit: {
    adapter: adapter(),
    csrf: {
      trustedOrigins: process.env.HAI_E2E === '1'
        ? ['http://localhost:4173', 'http://127.0.0.1:4173']
        : [],
    },
    alias: {
      // 双入口包（core/ai/storage）由 vite.config.ts 中的 haiResolvePlugin 条件解析
      '@h-ai/cache': '../../packages/cache/src/index.ts',
      '@h-ai/reldb': '../../packages/reldb/src/index.ts',
      '@h-ai/kit': '../../packages/kit/src/index.ts',
      '@h-ai/reach': '../../packages/reach/src/index.ts',
      '@h-ai/ui': '../../packages/ui/src/lib/index.ts',
      '@h-ai/ui/*': '../../packages/ui/*',
    },
  },
}

export default config
