/**
 * =============================================================================
 * hai API Service - Vite 配置
 * =============================================================================
 */

import path from 'node:path'
import process from 'node:process'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { haiResolvePlugin } from '../../packages/kit/src/vite/kit-vite-resolve.js'

export default defineConfig({
  plugins: [haiResolvePlugin(), sveltekit()],
  server: {
    fs: {
      allow: [
        path.resolve(process.cwd(), '..', '..'),
      ],
    },
  },
})
