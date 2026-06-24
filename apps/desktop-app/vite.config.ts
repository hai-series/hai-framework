/**
 * =============================================================================
 * hai Desktop App - Vite 配置
 * =============================================================================
 * 关键点：
 * - 固定端口 5176（与 src-tauri/tauri.conf.json 的 devUrl 对齐）
 * - strictPort: 端口被占用时直接报错，避免与 Tauri 启动顺序错位
 * - clearScreen: false：保留 Tauri 控制台输出
 * - HMR host：从 TAURI_DEV_HOST 读取（Android 真机调试时由 Tauri 注入）
 */

import process from 'node:process'
import { haiOptimizeExclude, haiPrebundledDeps } from '@h-ai/ui/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [svelte(), tailwindcss()],

  // Vite 选项专为 Tauri 调整
  clearScreen: false,
  server: {
    port: 5176,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5177,
        }
      : undefined,
    watch: {
      // tauri 后端文件改动不应触发前端 HMR
      ignored: ['**/src-tauri/**'],
    },
  },

  // 阻止 Vite 预打包 @h-ai/ui 与 bits-ui — 保留 svelte 文件由 vite-plugin-svelte 处理
  optimizeDeps: {
    // @internationalized/date 须与 bits-ui 同为原始副本，避免 "Unknown date type"。
    exclude: ['@h-ai/ui', ...haiOptimizeExclude],
    // 提前预打包 @h-ai/* 框架的重型纯 JS 依赖，避免运行中途触发依赖再优化与整页刷新。
    include: [...haiPrebundledDeps],
  },

  // 环境变量前缀：PUBLIC_ + VITE_
  envPrefix: ['VITE_', 'PUBLIC_'],
})
