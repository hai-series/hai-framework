import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: ['@h-ai/core', 'yaml'],
  metafile: true,
  // 发布 CLI 内联纯配置和离线协议，不要求目标应用安装数据库、存储或邮件服务。
  noExternal: ['@h-ai/reldb/schemas', '@h-ai/feedback/bundle', 'fflate', /^zod(?:\/.*)?$/],
  esbuildOptions(options) {
    // 公开构建产物已内嵌回放资源，不能经根 tsconfig 路径落回未注入资源的源码入口。
    options.alias = { ...options.alias, '@h-ai/feedback/bundle': fileURLToPath(import.meta.resolve('@h-ai/feedback/bundle')) }
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
})
