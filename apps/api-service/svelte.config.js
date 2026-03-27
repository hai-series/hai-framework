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
  },
}

export default config
