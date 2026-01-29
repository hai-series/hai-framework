/**
 * =============================================================================
 * 共享 tsup 配置
 * =============================================================================
 * 各包通过扩展此配置，只需定义 entry 和 external
 */

import type { Options } from 'tsup'

export const baseConfig: Options = {
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: 'node20',
}
