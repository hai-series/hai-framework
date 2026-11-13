import type { HaiResult } from '@h-ai/core'
import type { Readable, Writable } from 'node:stream'
import type { z } from 'zod'
import type { json, RunnerConfigInput, RunnerEnvironment, submitSchema } from './runner-config.js'
import { core } from '@h-ai/core'

/**
 * 持久执行错误定义。业务处理失败另记录为执行终态。
 * @example
 * ```ts
 * import { HaiRunnerError } from '@h-ai/runner'
 * const key = HaiRunnerError.CONFLICT
 * ```
 */
export const HaiRunnerError = core.error.buildHaiErrorsDef('runner', {
  NOT_INITIALIZED: '010:503',
  ALREADY_INITIALIZED: '011:409',
  INVALID: '020:400',
  NOT_FOUND: '021:404',
  CONFLICT: '022:409',
  UNAVAILABLE: '023:503',
  CAPACITY: '024:429',
  LEASE_LOST: '025:409',
  CLEANUP_UNCONFIRMED: '026:503',
})

/**
 * 可持久化的输入、事件和输出。
 * @example
 * ```ts
 * import type { RunnerJson } from '@h-ai/runner'
 * const event: RunnerJson = { step: 'ready', parts: [1, 2] }
 * ```
 */
export type RunnerJson = z.infer<typeof json>

/**
 * 由可信应用确定的任务主体。
 * @example
 * ```ts
 * import type { RunnerScope } from '@h-ai/runner'
 * const scope: RunnerScope = { tenantId: 'engineering', userId: 'alice' }
 * ```
 */
export type RunnerScope = RunnerSubmit['scope']

/**
 * 不含密钥或本机文件路径的持久提交参数。
 * @example
 * ```ts
 * import type { RunnerSubmit } from '@h-ai/runner'
 * const task: RunnerSubmit = { scope: { tenantId: 'team', userId: 'alice' }, kind: 'reports.v1', input: { page: 1 } }
 * ```
 */
export type RunnerSubmit = z.input<typeof submitSchema>

/**
 * 当前执行者的启动代次；节点重启后代次会变化。
 * @example
 * ```ts
 * import type { RunnerOwner } from '@h-ai/runner'
 * function node(owner: RunnerOwner) { return owner.nodeId }
 * ```
 */
export interface RunnerOwner {
  nodeId: string
  generation: string
}

/**
 * 跨实例可读取的执行状态和结果。
 * @example
 * ```ts
 * import type { RunnerExecution } from '@h-ai/runner'
 * function isDone(execution: RunnerExecution) { return execution.status === 'succeeded' }
 * ```
 */
export interface RunnerExecution {
  id: string
  status: 'queued' | 'running' | 'cancelling' | 'cancelled' | 'succeeded' | 'failed' | 'unknown'
  owner?: RunnerOwner
  environmentId?: string
  output?: RunnerJson
  failure?: 'queue-timeout' | 'run-timeout' | 'handler-failed' | 'owner-lost' | 'parent-ended' | 'cleanup-unconfirmed'
  createdAt: number
  updatedAt: number
}

/**
 * 持久事件游标从 1 开始，按执行内递增。
 * @example
 * ```ts
 * import type { RunnerEvent } from '@h-ai/runner'
 * function nextCursor(event: RunnerEvent) { return event.sequence }
 * ```
 */
export interface RunnerEvent {
  sequence: number
  data: RunnerJson
  createdAt: number
}

/**
 * 仅限可信已注册处理器调用。工作目录默认 /workspace，配置文件置于 /state。
 * @example
 * ```ts
 * import type { RunnerLaunch } from '@h-ai/runner'
 * const launch: RunnerLaunch = { command: 'cat', args: ['/state/manifest.json'], files: { 'manifest.json': '{}' } }
 * ```
 */
export interface RunnerLaunch {
  command: string
  args?: string[]
  env?: Record<string, string>
  files?: Record<string, string>
  /** 规范 Base64 输入文件；提供空对象时也会分配 /input 与 /output。 */
  inputs?: Record<string, string>
  cwd?: string
}

/**
 * 容器标准流与经过核验的停止操作。
 * @example
 * ```ts
 * import type { RunnerProcess } from '@h-ai/runner'
 * async function stop(process: RunnerProcess) { return process.close() }
 * ```
 */
export interface RunnerProcess {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  wait: () => Promise<{ code: number | null, signal: NodeJS.Signals | null }>
  /** 从仍运行的工具容器读取一个受限普通文件，返回规范 Base64。 */
  artifact: (name: string, maxBytes: number) => Promise<HaiResult<string>>
  close: () => Promise<HaiResult<void>>
}

/**
 * 处理器只在当前租约拥有者内执行，启动和事件都经过持久代次检查。
 * @example
 * ```ts
 * import type { RunnerContext } from '@h-ai/runner'
 * async function accepted(context: RunnerContext) { return context.emit({ id: context.id }) }
 * ```
 */
export interface RunnerContext {
  id: string
  scope: RunnerScope
  owner: RunnerOwner
  parentId?: string
  signal: AbortSignal
  emit: (data: RunnerJson) => Promise<HaiResult<void>>
  start: (launch: RunnerLaunch) => Promise<HaiResult<RunnerProcess>>
}

/**
 * 可信服务器代码注册的处理器；输入需要由业务再次校验。
 * @example
 * ```ts
 * import type { RunnerHandler } from '@h-ai/runner'
 * const handler: RunnerHandler = async (input) => ({ echoed: input })
 * ```
 */
export type RunnerHandler = (input: RunnerJson, context: RunnerContext) => Promise<RunnerJson>

/**
 * 注入 ACP 或工具服务的受管执行对象。
 * @example
 * ```ts
 * import type { RunnerFunctions } from '@h-ai/runner'
 * async function ready(instance: RunnerFunctions) { return instance.init({ nodeId: 'east' }) }
 * ```
 */
export interface RunnerFunctions {
  /** 当前实例已启动并承担执行角色。 */
  readonly isExecutor: boolean
  /** 启动前应先初始化 reldb。 */
  init: (config: RunnerConfigInput) => Promise<HaiResult<void>>
  /** 停止领取，取消本节点执行并核验清理。 */
  close: () => Promise<HaiResult<void>>
  /** 当前环境快照。 */
  environment: (id: string) => HaiResult<RunnerEnvironment>
  /** 注册处理器并返回仅移除该处理器的回调。 */
  register: (kind: string, handler: RunnerHandler) => HaiResult<() => void>
  /** 持久化接收，在可用节点领取。 */
  submit: (request: RunnerSubmit) => Promise<HaiResult<RunnerExecution>>
  /** 按业务幂等键定位既有执行。 */
  find: (scope: RunnerScope, kind: string, key: string) => Promise<HaiResult<RunnerExecution | undefined>>
  /** 根据可信主体读取任务。 */
  get: (scope: RunnerScope, id: string) => Promise<HaiResult<RunnerExecution>>
  /** 持久记录取消请求。 */
  cancel: (scope: RunnerScope, id: string) => Promise<HaiResult<RunnerExecution>>
  /** 分页读取保序事件。 */
  events: (scope: RunnerScope, id: string, after?: number, limit?: number) => Promise<HaiResult<RunnerEvent[]>>
}
