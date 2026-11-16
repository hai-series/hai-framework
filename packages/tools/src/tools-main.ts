import type { ToolsFunctions } from './tools-types.js'
import { createToolRegistry, defineTool } from './tools-functions.js'

/**
 * 工具定义和注册的统一入口，无生命周期与隐式注册。
 * @example
 * ```ts
 * import { tools } from '@h-ai/tools'
 * const registry = tools.createRegistry()
 * ```
 */
export const tools: ToolsFunctions = {
  define: defineTool,
  createRegistry: createToolRegistry,
}
