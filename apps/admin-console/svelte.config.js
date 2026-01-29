/**
 * =============================================================================
 * hai Admin Console - Svelte 配置
 * =============================================================================
 */

import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // 强制使用 Svelte 5 Runes
    runes: true,
  },
  kit: {
    adapter: adapter(),
    alias: {
      $components: './src/lib/components',
      $stores: './src/lib/stores',
      $utils: './src/lib/utils',
    },
  },
}

export default config
