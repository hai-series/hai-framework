import type { HaiResult } from '@h-ai/core'
import type { RunnerContext, RunnerEvent, RunnerExecution, RunnerFunctions, RunnerJson } from '@h-ai/runner'
import type { ToolInvoker, ToolSelection, ToolServiceContext, ToolSet, ToolSubmitRequest } from '@h-ai/tools/server'

/**
 * 宿主绑定的工具上下文。处理器运行时由适配器附加真实的 Runner 执行句柄。
 * @example
 * ```ts
 * import type { RunnerToolServiceContext } from '@h-ai/tools-runner'
 * const context: RunnerToolServiceContext = { scope: { tenantId: 'team', userId: 'alice' }, sessionId: 'task-1' }
 * ```
 */
export interface RunnerToolServiceContext extends ToolServiceContext {
  execution?: RunnerContext
}

/**
 * 将工具名称绑定到该任务需使用的 Runner 容器环境。
 * @example
 * ```ts
 * import type { RunnerToolSet } from '@h-ai/tools-runner'
 * const set: RunnerToolSet = { tools: [], environments: {} }
 * ```
 */
export interface RunnerToolSet extends ToolSet {
  environments?: Readonly<Record<string, string>>
}

/**
 * 持久幂等键与真实执行编号共同校验工具服务归属。
 * @example
 * ```ts
 * import type { ToolReceipt } from '@h-ai/tools-runner'
 * function executionId(receipt: ToolReceipt) { return receipt.id }
 * ```
 */
export interface ToolReceipt {
  id: string
  key: string
}

/**
 * 工具结果及原任务的 Runner 状态与事件。
 * @example
 * ```ts
 * import type { ToolRun } from '@h-ai/tools-runner'
 * function waiting(run: ToolRun) { return ['queued', 'running', 'cancelling'].includes(run.status) }
 * ```
 */
export interface ToolRun {
  receipt: ToolReceipt
  status: RunnerExecution['status']
  output?: RunnerJson
  failure?: RunnerExecution['failure']
  events: RunnerEvent[]
  next: number
}

/**
 * 提交和执行阶段均检查当前业务授权。
 * @example
 * ```ts
 * import type { ToolServiceAuthorization } from '@h-ai/tools-runner'
 * function principal(request: ToolServiceAuthorization) { return request.context.scope.userId }
 * ```
 */
export interface ToolServiceAuthorization {
  context: RunnerToolServiceContext
  name: string
  input: unknown
  phase: 'submit' | 'execute'
}

/**
 * 注入已初始化的 Runner、工具构造函数和宿主策略。服务只管理自身的处理器注册。
 * @example
 * ```ts
 * import type { ToolServiceOptions } from '@h-ai/tools-runner'
 * function serviceName(options: ToolServiceOptions) { return options.id }
 * ```
 */
export interface ToolServiceOptions {
  id: string
  runner: RunnerFunctions
  createTools: (context: RunnerToolServiceContext) => RunnerToolSet | Promise<RunnerToolSet>
  enabled: ToolSelection | ((context: RunnerToolServiceContext) => ToolSelection | Promise<ToolSelection>)
  authorize: (request: ToolServiceAuthorization) => boolean | Promise<boolean>
  runTimeoutMs?: number
  queueTimeoutMs?: number
}

/**
 * 工具任务服务。关闭会注销本服务处理器，活跃任务仍由 Runner 管理。
 * @example
 * ```ts
 * import type { ToolService } from '@h-ai/tools-runner'
 * function stop(service: ToolService) { service.close() }
 * ```
 */
export interface ToolService extends ToolInvoker {
  /** 按当前主体和服务的幂等键找回已提交任务。未知键成功返回 undefined。 */
  find: (idempotencyKey: string, context: ToolServiceContext) => Promise<HaiResult<ToolRun | undefined>>
  /** 开始持久化前响应取消。开始写入后等待真实的受理结果。 */
  submit: (request: ToolSubmitRequest, context: ToolServiceContext) => Promise<HaiResult<ToolRun>>
  inspect: (receipt: ToolReceipt, context: ToolServiceContext, options?: { after?: number }) => Promise<HaiResult<ToolRun>>
  cancel: (receipt: ToolReceipt, context: ToolServiceContext) => Promise<HaiResult<ToolRun>>
  /** 等待工具终态。提交期间取消且已受理时，错误的 ext.receipt 提供完整回执。 */
  invoke: (request: ToolSubmitRequest, context: ToolServiceContext) => Promise<HaiResult<RunnerJson>>
  close: () => void
}
