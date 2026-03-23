/**
 * =============================================================================
 * hai API Service - Vite 配置
 * =============================================================================
 */

import path from 'node:path'
import process from 'node:process'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: [
        path.resolve(process.cwd(), '..', '..'),
      ],
    },
  },
})
