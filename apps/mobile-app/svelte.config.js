/**
 * =============================================================================
 * hai Mobile App - Svelte 配置
 * =============================================================================
 * 这里仅保留 Svelte 编译与预处理配置；路由接入与宿主运行时配置位于 Vite / 应用入口侧。
 * @h-ai/ui 通过工作区依赖直接解析，不在此处额外声明 alias。
 */

import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    runes: true,
  },
}

export default config
