/**
 * =============================================================================
 * hai Mobile App - Svelte 配置
 * =============================================================================
 * 使用 adapter-static 输出 SPA，供 Capacitor 包装为 Android / iOS 原生应用。
 */

import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    runes: true,
  },
}

export default config
