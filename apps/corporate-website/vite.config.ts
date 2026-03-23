/**
 * =============================================================================
 * hai Corporate Website - Vite 配置
 * =============================================================================
 */

import path from 'node:path'
import process from 'node:process'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
      sveltekit(),
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        strategy: ['cookie', 'baseLocale'],
      }),
    ],
    optimizeDeps: {
      exclude: ['bits-ui'],
    },
    build: {
      rollupOptions: {
        external: ['pdfjs-dist/legacy/build/pdf.mjs', 'mammoth'],
      },
    },
    server: {
      fs: {
        allow: [
          path.resolve(process.cwd(), '..', '..'),
        ],
      },
    },
  }
})
