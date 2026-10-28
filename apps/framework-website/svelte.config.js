import { autoImportHaiUi } from '@h-ai/ui/auto-import'
import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: [autoImportHaiUi(), vitePreprocess()],
  compilerOptions: { runes: true },
  kit: {
    files: { assets: 'public' },
    env: { dir: './.svelte-kit' },
    adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
    paths: { base: '/hai-framework' },
  },
}
