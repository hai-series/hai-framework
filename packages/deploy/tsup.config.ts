import { copyFileSync } from 'node:fs'
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'yaml', 'zod'],
  // 只内联拥有者的纯 Schema，使用配置校验不要求安装数据库驱动。
  noExternal: ['@h-ai/reldb/schemas'],
  onSuccess: async () => {
    copyFileSync('src/container/deploy-runtime-env.mjs', 'dist/deploy-runtime-env.mjs')
  },
})
