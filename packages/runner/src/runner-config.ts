import { z } from 'zod'

const id = z.string().min(1).max(100).regex(/^[\w.-]+$/u)
const timeout = z.number().int().min(1).max(86_400_000)
const resources = z.strictObject({
  cpu: z.number().finite().positive().max(1024),
  memoryMiB: z.number().int().min(16).max(2_097_152),
  pids: z.number().int().min(1).max(1_048_576),
  scratchMiB: z.number().int().min(3).max(2_097_152),
})

/**
 * 容器资源限制；CPU 为核心数，内存和临时盘使用 MiB。
 * @example
 * ```ts
 * import type { RunnerResources } from '@h-ai/runner'
 * const resources: RunnerResources = { cpu: 1, memoryMiB: 256, pids: 32, scratchMiB: 64 }
 * ```
 */
export type RunnerResources = z.infer<typeof resources>

/**
 * 已登记且固定镜像的执行环境。
 * @example
 * ```ts
 * import type { RunnerEnvironment } from '@h-ai/runner'
 * function resolveImage(environment: RunnerEnvironment) { return environment.image }
 * ```
 */
export type RunnerEnvironment = z.infer<typeof environment>

const environment = z.strictObject({
  id,
  image: z.string().max(255).regex(/^(?:[\w.:/-]+@)?sha256:[a-f\d]{64}$/u),
  backend: z.literal('container').default('container'),
  architecture: z.enum(['x64', 'arm64']).optional(),
  capabilities: z.array(id).max(64).default([]),
  resources,
  networkPolicy: z.enum(['offline', 'internal']).default('offline'),
  network: id.optional(),
}).refine(value => value.networkPolicy === 'offline'
  ? !value.network
  : !!value.network && ![
      'host',
      'bridge',
      'none',
      'default',
      'podman',
    ].includes(value.network))

/**
 * Runner 启动配置 Schema。执行节点 ID 在部署中保持唯一。
 * @example
 * ```ts
 * import { RunnerConfigSchema } from '@h-ai/runner'
 * const result = RunnerConfigSchema.safeParse({ nodeId: 'api', executor: false })
 * ```
 */
export const RunnerConfigSchema = z.strictObject({
  nodeId: id,
  executor: z.boolean().default(true),
  engine: z.enum(['podman', 'docker']).default('podman'),
  capacity: resources.default({
    cpu: 4,
    memoryMiB: 4096,
    pids: 512,
    scratchMiB: 2048,
  }),
  leaseMs: z.number().int().min(1000).max(120_000).default(10_000),
  pollMs: z.number().int().min(10).max(1000).default(50),
  maxRunning: z.number().int().min(1).max(1000).default(8),
  maxRunningPerScope: z.number().int().min(1).max(1000).default(4),
  maxControlRunning: z.number().int().min(1).max(1000).default(8),
  maxQueued: z.number().int().min(1).max(100_000).default(5000),
  maxEvents: z.number().int().min(1).max(100_000).default(10_000),
  closeTimeoutMs: z.number().int().min(100).max(120_000).default(20_000),
  environments: z.array(environment).max(1000).default([]),
}).refine(value => value.pollMs * 3 < value.leaseMs
  && new Set(value.environments.map(entry => entry.id)).size === value.environments.length)

/**
 * 启动参数；默认执行角色，API 节点可单独关闭执行。
 * @example
 * ```ts
 * import type { RunnerConfigInput } from '@h-ai/runner'
 * const config: RunnerConfigInput = { nodeId: 'api-east', executor: false }
 * ```
 */
export type RunnerConfigInput = z.input<typeof RunnerConfigSchema>

/**
 * 配置解析后的默认值。
 * @example 模块内部上下文
 * ```ts
 * function interval(config: RunnerConfig) { return config.pollMs }
 * ```
 */
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>

/**
 * 持久 JSON 字段的校验，包括有限数值。
 * @example 模块内部上下文
 * ```ts
 * const value = json.safeParse({ message: 'ready' })
 * ```
 */
export const json = z.json()

/**
 * 持久提交及主体校验。
 * @example 模块内部上下文
 * ```ts
 * const value = submitSchema.safeParse({ scope: { tenantId: 'work', userId: 'alice' }, kind: 'report', input: null })
 * ```
 */
export const submitSchema = z.strictObject({
  scope: z.strictObject({
    tenantId: z.string().min(1).max(200),
    userId: z.string().min(1).max(200),
  }),
  kind: id,
  input: json,
  idempotencyKey: z.string().min(1).max(200).optional(),
  environmentId: id.optional(),
  resources: resources.partial().optional(),
  nodeId: id.optional(),
  parentId: z.string().regex(/^[\da-f]{64}$/u).optional(),
  reuseKey: z.string().min(1).max(200).optional(),
  queueTimeoutMs: timeout.default(300_000),
  runTimeoutMs: timeout.default(300_000),
}).refine(value => !value.parentId || (!value.nodeId && !value.environmentId && !value.resources && !value.reuseKey))

/**
 * 可信执行器注册名称校验。
 * @example 模块内部上下文
 * ```ts
 * const valid = runnerKind.safeParse('reports.v1').success
 * ```
 */
export const runnerKind = id
