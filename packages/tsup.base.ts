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
  dts: !isDockerProdBuild,
  clean: true,
  sourcemap: !isDockerProdBuild,
  treeshake: true,
  target: 'node20',
}
