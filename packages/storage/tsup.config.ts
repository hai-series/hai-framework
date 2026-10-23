import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  // 保留 Node 内建模块协议，供下游 SSR/测试运行器明确识别流模块。
  removeNodeProtocol: false,
  // Node 主入口 + Browser 入口 + 纯客户端子路径导出
  entry: {
    'node': 'src/index.ts',
    'browser': 'src/storage-index.browser.ts',
    'client/index': 'src/client/index.ts',
    'schemas': 'src/storage-schemas.ts',
  },
  // 运行时依赖保持 external，避免重复打包
  external: [
    '@h-ai/core',
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
    '@aws-sdk/s3-request-presigner',
    'zod',
  ],
})
