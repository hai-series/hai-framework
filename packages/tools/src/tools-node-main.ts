import type { ToolsFunctions } from './tools-types.js'
import { createArtifactTools } from './tools-artifact-functions.js'
import { tools as lightweightTools } from './tools-main.js'

/**
 * Node 工具入口的类型，包含轻量工具和产物工具工厂。
 * @example
 * ```ts
 * import { type ToolsServerFunctions, tools } from '@h-ai/tools/server'
 * const entry: ToolsServerFunctions = tools
 * ```
 */
export interface ToolsServerFunctions extends ToolsFunctions {
  createArtifactTools: typeof createArtifactTools
}

/**
 * Node 服务端工具入口，提供轻量工具及由宿主授权的产物工具。
 * @example
 * ```ts
 * import { type ArtifactToolOptions, tools } from '@h-ai/tools/server'
 * function registerArtifacts(options: ArtifactToolOptions) {
 *   return tools.createRegistry().registerMany(tools.createArtifactTools(options).tools)
 * }
 * ```
 */
export const tools: ToolsServerFunctions = {
  ...lightweightTools,
  createArtifactTools,
}
export type { ArtifactToolOptions } from './tools-artifact-functions.js'
export type { ToolArtifact, ToolArtifactAccess, ToolArtifactReference } from './tools-artifact-types.js'
export type {
  ToolCatalog,
  ToolGroup,
  ToolInvoker,
  ToolJson,
  ToolSelection,
  ToolServiceContext,
  ToolSet,
  ToolSubmitRequest,
} from './tools-invocation-types.js'
