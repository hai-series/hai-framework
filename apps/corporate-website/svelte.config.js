/**
 * 企业官网 - Svelte 配置
 */
import process from 'node:process'
import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: {
    runes: true,
  },
  kit: {
    // 环境文件由 Vite 的 core loader 统一加载；Kit 不再二次读取根目录私有配置。
    env: { dir: './.svelte-kit' },
    adapter: adapter(),
    csrf: {
      trustedOrigins: process.env.HAI_E2E === '1'
        ? ['http://localhost:4173', 'http://127.0.0.1:4173']
        : [],
    },
  },
}

export default config
