/**
 * =============================================================================
 * hai Android App - Svelte 配置
 * =============================================================================
 * 使用 adapter-static 输出 SPA，供 Capacitor 包装为 Android APK。
 */

import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    runes: true,
  },
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
    }),
    alias: {
      '@h-ai/ui': '../../packages/ui/src/lib/index.ts',
      '@h-ai/ui/*': '../../packages/ui/*',
    },
  },
}

export default config
