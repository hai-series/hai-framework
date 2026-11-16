import { tools as lightweightTools } from '../tools-main.js'
import { createArtifactTools } from './tools-artifact-functions.js'
import { createJobTools } from './tools-job-functions.js'
import { createToolService } from './tools-service-functions.js'

/**
 * 服务端工具入口：借用 Runner 执行，资源存取由宿主授权。
 * @example
 * ```ts
 * import { tools } from '@h-ai/tools/server'
 * const registry = tools.createRegistry()
 * ```
 */
export const tools = {
  ...lightweightTools,
  createService: createToolService,
  createArtifactTools,
  createJobTools,
}
export type { ArtifactToolOptions } from './tools-artifact-functions.js'
export type { JobToolOptions } from './tools-job-functions.js'
export type { ToolArtifact, ToolArtifactAccess, ToolArtifactReference } from './tools-service-resources.js'
export type {
  ToolCatalog,
  ToolGroup,
  ToolReceipt,
  ToolRun,
  ToolSelection,
  ToolService,
  ToolServiceAuthorization,
  ToolServiceContext,
  ToolServiceOptions,
  ToolSet,
  ToolsServerFunctions,
  ToolSubmitRequest,
} from './tools-service-types.js'
