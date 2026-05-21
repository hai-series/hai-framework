/**
 * =============================================================================
 * hai Desktop App - Svelte 配置
 * =============================================================================
 * 仅使用 @sveltejs/vite-plugin-svelte（无 SvelteKit），适配 Tauri v2 沙箱内的纯 SPA。
 * 使用 autoImportHaiUi() 让 .svelte 文件直接使用 @h-ai/ui 组件，无需逐个 import。
 */

import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    runes: true,
  },
}
