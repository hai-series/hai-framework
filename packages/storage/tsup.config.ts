import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  // Node 主入口 + Browser 入口 + 纯客户端子路径导出
  entry: {
    'node': 'src/index.ts',
    'browser': 'src/storage-index.browser.ts',
    'client/index': 'src/client/index.ts',
    'api/index': 'src/api/index.ts',
  },
  // 运行时依赖保持 external，避免重复打包
  external: [
    '@h-ai/core',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'zod',
  ],
})
