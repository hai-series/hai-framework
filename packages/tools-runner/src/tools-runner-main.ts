import { createJobTools } from './tools-runner-job-functions.js'
import { createToolService } from './tools-runner-service-functions.js'

/**
 * 将工具服务接到宿主已初始化的 Runner，提供持久任务和固定容器工具。
 * @example
 * ```ts
 * import type { ToolServiceOptions } from '@h-ai/tools-runner'
 * import { toolsRunner } from '@h-ai/tools-runner'
 *
 * function start(options: ToolServiceOptions) {
 *   return toolsRunner.createService(options)
 * }
 * ```
 */
export const toolsRunner = {
  createService: createToolService,
  createJobTools,
}
