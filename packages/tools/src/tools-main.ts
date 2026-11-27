import type { ToolsFunctions } from './tools-types.js'
import { createToolRegistry, defineTool } from './tools-functions.js'

/**
 * Node 和浏览器共用的轻量工具入口，无生命周期与隐式注册。
 * 需要宿主授权访问产物时使用 Node 入口 `@h-ai/tools/server`。
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
