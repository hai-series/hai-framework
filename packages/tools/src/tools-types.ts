import type { HaiResult } from '@h-ai/core'
import type { ZodType } from 'zod'
import { core } from '@h-ai/core'

/**
 * 工具执行错误，不包含模型或传输协议错误。
 * @example
 * ```ts
 * import { HaiToolsError } from '@h-ai/tools'
 * const forbidden = HaiToolsError.FORBIDDEN
 * ```
 */
export const HaiToolsError = core.error.buildHaiErrorsDef('tools', {
  NOT_FOUND: '020:404',
  ALREADY_REGISTERED: '021:409',
  VALIDATION_FAILED: '022:400',
  EXECUTION_FAILED: '023:500',
  FORBIDDEN: '024:403',
  TIMEOUT: '025:504',
  CANCELLED: '026:499',
})

/**
 * 与模型协议无关的工具描述。
 * @example
 * ```ts
 * import type { ToolDefinition } from '@h-ai/tools'
 * const definition: ToolDefinition = { name: 'echo', description: 'Echo text', inputSchema: { type: 'object' } }
 * ```
 */
export interface ToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  examples?: readonly { label: string, input: Record<string, unknown> }[]
}

/**
 * 可信执行上下文，取消信号始终存在。
 * @example
 * ```ts
 * import type { ToolExecutionContext } from '@h-ai/tools'
 * function subject(context: ToolExecutionContext) { return context.objectId }
 * ```
 */
export interface ToolExecutionContext {
  signal: AbortSignal
  objectId?: string
  sessionId?: string
  deadline: number
}

/**
 * 授权只接收已经过 Schema 校验和规范化的输入。
 * @example
 * ```ts
 * import type { ToolAuthorizationRequest } from '@h-ai/tools'
 * function isBound(request: ToolAuthorizationRequest) { return !!request.context.objectId }
 * ```
 */
export interface ToolAuthorizationRequest {
  toolName: string
  input: unknown
  context: ToolExecutionContext
}

/**
 * 授权拒绝或异常均阻止执行。
 * @example
 * ```ts
 * import type { ToolAuthorizer } from '@h-ai/tools'
 * const authorize: ToolAuthorizer = ({ context }) => context.objectId === 'user-1'
 * ```
 */
export type ToolAuthorizer = (request: ToolAuthorizationRequest) => boolean | Promise<boolean>

/**
 * 单次执行上下文，截止时间优先于各级超时。
 * @example
 * ```ts
 * import type { ToolExecutionOptions } from '@h-ai/tools'
 * const options: ToolExecutionOptions = { objectId: 'user-1', timeoutMs: 5000 }
 * ```
 */
export interface ToolExecutionOptions {
  signal?: AbortSignal
  objectId?: string
  sessionId?: string
  deadline?: number
  timeoutMs?: number
  authorize?: ToolAuthorizer
}

/**
 * 工具定义的业务输入与处理函数。
 * @example
 * ```ts
 * import type { DefineToolOptions } from '@h-ai/tools'
 * import { z } from 'zod'
 * const options: DefineToolOptions<{ value: string }, string> = { name: 'echo', description: 'Echo text', parameters: z.object({ value: z.string() }), handler: input => input.value }
 * ```
 */
export type DefineToolOptions<TInput, TOutput> = {
  name: string
  title?: string
  description: string
  examples?: readonly { label: string, input: Record<string, unknown> }[]
  parameters: ZodType<TInput>
  timeoutMs?: number
} & ({
  handler: (input: TInput, context: ToolExecutionContext) => TOutput | Promise<TOutput>
  resultHandler?: never
} | {
  handler?: never
  resultHandler: (input: TInput, context: ToolExecutionContext) => HaiResult<TOutput> | Promise<HaiResult<TOutput>>
})

/**
 * 工具实例，所有业务输入在执行时重新校验。
 * @example
 * ```ts
 * import { tools } from '@h-ai/tools'
 * import { z } from 'zod'
 * const echo = tools.define({ name: 'echo', description: 'Echo text', parameters: z.string(), handler: text => text })
 * const result = await echo.execute('hello')
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly description: string
  readonly parameters: ZodType<TInput>
  execute: (input: unknown, options?: ToolExecutionOptions) => Promise<HaiResult<TOutput>>
  toDefinition: () => ToolDefinition
}

/**
 * 注册器级授权与单次授权必须同时通过。
 * @example
 * ```ts
 * import type { ToolRegistryOptions } from '@h-ai/tools'
 * const options: ToolRegistryOptions = { authorize: ({ context }) => !!context.objectId }
 * ```
 */
export interface ToolRegistryOptions {
  authorize?: ToolAuthorizer
}

/**
 * 直接业务调用，不携带模型消息或 JSON 字符串参数。
 * @example
 * ```ts
 * import type { ToolInvocation } from '@h-ai/tools'
 * const invocation: ToolInvocation = { name: 'sum', input: { a: 1, b: 2 } }
 * ```
 */
export interface ToolInvocation {
  name: string
  input: unknown
}

/**
 * 进程内工具集合。任务状态、租约和产物由相应服务保存。
 * @example
 * ```ts
 * import { tools } from '@h-ai/tools'
 * const registry = tools.createRegistry()
 * const definitions = registry.getDefinitions()
 * ```
 */
export interface ToolRegistryOperations {
  register: <TInput, TOutput>(tool: Tool<TInput, TOutput>) => HaiResult<void>
  registerMany: (tools: Tool[]) => HaiResult<void>
  replace: <TInput, TOutput>(tool: Tool<TInput, TOutput>) => HaiResult<void>
  unregister: (name: string) => boolean
  get: (name: string) => Tool | undefined
  has: (name: string) => boolean
  getNames: () => string[]
  getDefinitions: () => ToolDefinition[]
  execute: (name: string, input: unknown, options?: ToolExecutionOptions) => Promise<HaiResult<unknown>>
  executeAll: (calls: ToolInvocation[], options?: ToolExecutionOptions & { parallel?: boolean }) => Promise<HaiResult<unknown[]>>
  clear: () => void
  readonly size: number
}

/**
 * Tools 的纯工厂入口，不需要 init/close。
 * @example
 * ```ts
 * import { tools } from '@h-ai/tools'
 * const registry = tools.createRegistry()
 * ```
 */
export interface ToolsFunctions {
  /** 定义工具。无效名称或默认超时作为定义错误抛出 TypeError。 */
  define: <TInput, TOutput>(options: DefineToolOptions<TInput, TOutput>) => Tool<TInput, TOutput>
  createRegistry: (options?: ToolRegistryOptions) => ToolRegistryOperations
}
