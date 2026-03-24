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
  ssr: {
    noExternal: [/@h-ai\//],
    /**
     * LanceDB 含原生 .node 扩展；与 noExternal 一起打包 @h-ai/vecdb 时，
     * Rollup 会误入二进制文件并报 PARSE_ERROR。将 lancedb 标为 external，运行时由 Node 解析。
     */
    external: ['@lancedb/lancedb'],
  },
  server: {
    fs: {
      allow: [
        path.resolve(process.cwd(), '..', '..'),
      ],
    },
  },
})
