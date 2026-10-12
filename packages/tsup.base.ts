/**
 * =============================================================================
 * 共享 tsup 配置
 * =============================================================================
 * 各包通过扩展此配置，只需定义 entry 和 external
 */

import type { Options } from 'tsup'

import process from 'node:process'

const isDockerProdBuild = process.env.HAI_DOCKER_PROD_BUILD === 'true'

export const baseConfig: Options = {
  format: ['esm'],
  // 声明构建仍使用 TypeScript 6 API，tsup 内部注入的 baseUrl 需明确兼容。
  dts: isDockerProdBuild ? false : { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  sourcemap: !isDockerProdBuild,
  treeshake: true,
  target: 'node22',
}
