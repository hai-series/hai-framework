/**
 * 类型声明：@h-ai/ui/vite 开发优化辅助。
 */

/**
 * hai 框架在开发态需要提前预打包的纯 JS 依赖清单。
 */
export declare const haiPrebundledDeps: readonly string[]

/**
 * 需要从 Vite 依赖预打包中排除的依赖清单（bits-ui 及其 @internationalized/date 单实例）。
 */
export declare const haiOptimizeExclude: readonly string[]
