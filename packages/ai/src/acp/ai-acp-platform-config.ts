import { z } from 'zod'

const id = z.string().min(1).max(100).regex(/^[\w.-]+$/u)
const ids = z.array(id).max(64)
const milliseconds = z.number().int().min(1).max(86_400_000)

/**
 * 受管执行与逐轮可选参数。运行前再次核对部署上限。
 * @example 模块内部上下文
 * ```ts
 * const options = platformOptionsSchema.parse({ execution: { mode: 'task' } })
 * ```
 */
export const platformOptionsSchema = z.strictObject({
  /** 已登记模型和适配器支持的覆盖值。 */
  model: z.strictObject({
    /** 已登记的模型 ID。 */
    id: id.optional(),
    /** 模型声明支持的推理级别。 */
    reasoningEffort: id.optional(),
    /** 适配器支持的采样温度。 */
    temperature: z.number().min(0).max(2).optional(),
    /** 模型单次输出 Token 上限。 */
    maxOutputTokens: z.number().int().positive().optional(),
  }).optional(),
  /** Worker 模式、环境与资源覆盖。 */
  execution: z.strictObject({
    /** 会话的 Worker 分配模式。 */
    mode: z.enum(['auto', 'shared', 'user', 'task']).optional(),
    /** 允许使用的已登记环境 ID。 */
    environmentId: id.optional(),
    /** 在环境资源上限内请求的资源。 */
    resources: z.strictObject({
      /** CPU 核心数。 */
      cpu: z.number().positive().max(1024).optional(),
      /** 内存 MiB。 */
      memoryMiB: z.number().int().min(16).optional(),
    }).optional(),
  }).optional(),
  /** 应用登记的工作区 ID。 */
  workspaceId: id.optional(),
  /** 本次请求引用的业务资料。 */
  context: z.strictObject({
    /** 可授权读取的文件 ID。 */
    fileIds: ids.optional(),
    /** 可授权检索的知识库 ID。 */
    knowledgeBaseIds: ids.optional(),
    /** 登记的技能 ID。 */
    skillIds: ids.optional(),
    /** 记忆读取和写入范围。 */
    memory: z.strictObject({
      /** 记忆的用户或空间范围。 */
      scope: z.enum(['none', 'user', 'space']),
      /** 指定共享空间 ID。 */
      spaceId: id.optional(),
      /** 记忆写入策略。 */
      write: z.enum(['none', 'confirm', 'on-success']).optional(),
    }).refine(value => (value.scope === 'space') === !!value.spaceId).optional(),
  }).optional(),
  /** 本任务选择的逻辑工具。 */
  tools: z.strictObject({
    /** 允许使用的已登记工具 ID。 */
    allow: ids.optional(),
  }).optional(),
  /** 所需的运行环境能力。 */
  capabilities: ids.optional(),
  /** 任务权限范围和审批策略。 */
  permissions: z.strictObject({
    /** 原生权限预设。 */
    profile: z.enum(['read-only', 'workspace', 'full-access']).optional(),
    /** 是否允许发起交互审批。 */
    approval: z.enum(['on-request', 'never']).optional(),
    /** 应用可校验的持久授权规则。 */
    ruleIds: ids.optional(),
  }).optional(),
  /** 执行、排队、审批和输出上限。 */
  limits: z.strictObject({
    /** 排队等待上限，毫秒。 */
    queueTimeoutMs: milliseconds.optional(),
    /** 单轮执行上限，毫秒。 */
    runTimeoutMs: milliseconds.optional(),
    /** 单次审批等待上限，毫秒。 */
    approvalTimeoutMs: milliseconds.optional(),
    /** 文本输出上限，字节。 */
    maxOutputBytes: z.number().int().min(1).max(8 * 1024 * 1024).optional(),
  }).optional(),
  /** 文本或结构化输出。 */
  output: z.strictObject({
    /** 结果格式。 */
    format: z.enum(['text', 'json']),
    /** 用于校验最终 JSON 的 Schema。 */
    schema: z.record(z.string(), z.json()).optional(),
  }).refine(value => !value.schema || value.format === 'json').optional(),
  /** 由适配器验证的原生选项。 */
  native: z.strictObject({
    /** 原生适配器 ID。 */
    adapter: id,
    /** 适配器声明支持的原生参数。 */
    options: z.record(z.string(), z.json()),
  }).optional(),
  /** 有限的业务标签，不作为身份依据。 */
  metadata: z.record(z.string().regex(/^[\w.-]{1,48}$/u), z.string().max(128))
    .refine(value => Object.keys(value).length <= 16 && !Object.keys(value).some(key => /^(?:owner|tenant|user|role|scope)/i.test(key)))
    .optional(),
})

/**
 * 计划或持续会话的参数。
 * @example 模块内部上下文
 * ```ts
 * const request = platformRequestSchema.parse({ agentId: 'assistant' })
 * ```
 */
export const platformRequestSchema = platformOptionsSchema.extend({ agentId: id })

/**
 * 受管首轮输入。原生内容块仍由 ACP SDK 验证。
 * @example 模块内部上下文
 * ```ts
 * const request = platformRunSchema.parse({ agentId: 'assistant', prompt: '总结资料' })
 * ```
 */
export const platformRunSchema = platformRequestSchema.extend({
  prompt: z.union([
    z.string().min(1),
    z.array(z.record(z.string(), z.json())).min(1).max(256),
  ]),
  idempotencyKey: z.string().min(1).max(160).optional(),
})

/**
 * 可信服务端身份引用。
 * @example 模块内部上下文
 * ```ts
 * const scope = platformScopeSchema.parse({ tenantId: 'team', userId: 'alice' })
 * ```
 */
export const platformScopeSchema = z.strictObject({ tenantId: id, userId: id })
