/**
 * =============================================================================
 * hai API Service - Svelte 配置
 * =============================================================================
 */

import process from 'node:process'
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
  kit: {
    adapter: adapter(),
    csrf: {
      trustedOrigins: process.env.HAI_E2E === '1'
        ? ['http://localhost:4174', 'http://127.0.0.1:4174']
        : [],
    },
    alias: {
      // 双入口包（@h-ai/core）由 vite.config.ts 中的 haiResolvePlugin 条件解析
      '@h-ai/cache': '../../packages/cache/src/index.ts',
      '@h-ai/db': '../../packages/db/src/index.ts',
      '@h-ai/kit': '../../packages/kit/src/index.ts',
    },
  },
}

export default config
