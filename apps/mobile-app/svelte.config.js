/**
 * =============================================================================
 * hai Mobile App - Svelte 配置
 * =============================================================================
 * SvelteKit 将页面输出到 build/，供 Capacitor 与 Nginx 共用。
 * @h-ai/ui 通过工作区依赖直接解析，不在此处额外声明 alias。
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
    // 环境文件由 Vite 的 core loader 统一加载，构建不读取根目录私有配置。
    env: { dir: './.svelte-kit' },
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
    }),
  },
}

export default config
