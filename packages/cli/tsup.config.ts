import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: ['@h-ai/core', 'yaml'],
  metafile: true,
  // 发布 CLI 内联纯配置契约与 Zod，不要求目标应用安装数据库包或原生驱动。
  noExternal: ['@h-ai/reldb/schemas', /^zod(?:\/.*)?$/],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
