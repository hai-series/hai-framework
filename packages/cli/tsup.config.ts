import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

const feedbackBundle = import.meta.resolve('@h-ai/feedback/bundle')

export default defineConfig({
  ...baseConfig,
  entry: {
    'index': 'src/index.ts',
    // 内联离线包读写逻辑的同时，发布其独立的 Node Worker 入口。
    'feedback-bundle-node-worker': fileURLToPath(new URL('../feedback-bundle-node-worker.js', feedbackBundle)),
  },
  external: ['@h-ai/core', 'yaml'],
  metafile: true,
  // 发布 CLI 内联纯配置和离线协议，不要求目标应用安装数据库、存储或邮件服务。
  noExternal: [
    '@h-ai/reldb/schemas',
    '@h-ai/feedback/bundle',
    'fflate',
    /^zod(?:\/.*)?$/,
  ],
  esbuildOptions(options) {
    // 公开构建产物已内嵌回放资源，不能经根 tsconfig 路径落回未注入资源的源码入口。
    options.alias = {
      ...options.alias,
      '@h-ai/feedback/bundle': fileURLToPath(feedbackBundle),
    }
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
})
