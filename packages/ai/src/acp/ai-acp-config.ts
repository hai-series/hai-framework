import { z } from 'zod'

const acpIdSchema = z.string().regex(/^[a-z0-9][\w-]{0,95}$/i)
const branch = z
  .string()
  .min(1)
  .max(240)
  .refine(
    value =>
      !value.startsWith('-')
      && !/[\s~^:?*\\[]/.test(value)
      && !Array.from(value).some(character => character.charCodeAt(0) < 32)
      && !value.includes('..')
      && !value.includes('@{')
      && !value.endsWith('.lock')
      && !value.endsWith('/')
      && !value.startsWith('/'),
  )
const environment = z
  .record(z.string().regex(/^[A-Z_]\w*$/i), z.string().regex(/^[A-Z_]\w*$/i))
  .default({})

/**
 * 工程主分支必须显式填写。
 * @example
 * ```ts
 * import { ACPRepositorySchema } from '@h-ai/ai'
 * const repository = ACPRepositorySchema.parse({ id: 'api', url: 'https://example.com/api.git', mainBranch: 'trunk' })
 * ```
 */
export const ACPRepositorySchema = z.strictObject({
  /** 清单中的唯一 ID；同时用于受管理目录名。 */
  id: acpIdSchema.refine(value => !['files', '.state'].includes(value)),
  /** 远程地址，不允许命令选项和换行。 */
  url: z
    .string()
    .min(1)
    .refine(value => !value.startsWith('-') && !/[\r\n\0]/.test(value)),
  /** 该工程明确指定的主分支，更新和 merge-main 发布均使用此值。 */
  mainBranch: branch,
  /** Git remote 名，默认 origin。 */
  remote: acpIdSchema.default('origin'),
})

/**
 * 工作区持久目录或容器卷。
 * @example
 * ```ts
 * import { ACPWorkspaceSchema } from '@h-ai/ai'
 * const workspace = ACPWorkspaceSchema.parse({ id: 'project', storage: { type: 'directory', path: '/srv/project' }, repositories: [] })
 * ```
 */
export const ACPWorkspaceSchema = z
  .strictObject({
    /** 清单中的唯一 ID；同时用于受管理目录名。 */
    id: acpIdSchema,
    /** 持久存储位置；directory 供本机，volume 供托管容器。 */
    storage: z.discriminatedUnion('type', [
      z.strictObject({
        /** 本机目录存储。 */
        type: z.literal('directory'),
        /** 本机绝对或相对目录，运行时归一化为真实绝对路径。 */
        path: z.string().min(1),
      }),
      z.strictObject({
        /** 存储类型判别字段。 */
        type: z.literal('volume'),
        /** 可读名称；volume 时表示持久卷名。 */
        name: acpIdSchema,
        /** auto 优先可用 Podman，再选 Docker；显式选择不自动降级。 */
        engine: z.enum(['auto', 'podman', 'docker']).default('auto'),
        /** 已部署的 Agent 镜像，工作区和智能体需使用同一镜像。 */
        image: z
          .string()
          .min(1)
          .refine(value => !value.startsWith('-')),
      }),
    ]),
    /** 多个 Git 工程；默认空数组，不使用 Git 时仅创建文件目录。 */
    repositories: z.array(ACPRepositorySchema).default([]),
    /** 工作区历史共用变量映射；Agent 专用凭据应配置在 Agent 定义中。 */
    environmentRefs: environment,
    /** 仅供受管 Git 远程操作使用的环境变量引用，值不传给 Agent 或本地提交。 */
    gitEnvironmentRefs: environment,
  })
  .refine(
    value =>
      new Set(value.repositories.map(repo => repo.id)).size
        === value.repositories.length,
  )

const common = {
  /** 清单中的唯一 ID；同时用于受管理目录名。 */
  id: acpIdSchema,
  /** 智能体的可读名称。 */
  name: z.string().min(1),
  /** 默认启用，禁用后禁止新建和恢复会话。 */
  enabled: z.boolean().default(true),
  /** 原生配置适配器名称，默认 generic。 */
  adapter: z.string().min(1).default('generic'),
  /** 绑定 Hai LLM 模型 ID；默认空数组。 */
  modelIds: z.array(z.string().min(1)).default([]),
  /** 默认选择的模型 ID，必须存在于 modelIds。 */
  defaultModelId: z.string().min(1).optional(),
  /** 目标环境变量名到宿主环境变量名的映射；保存引用而非明文凭据。 */
  environmentRefs: environment,
}
const launch = {
  /** 可选原生程序覆盖，使用参数数组执行，不经过 shell。 */
  command: z.string().min(1).optional(),
  /** 原生启动参数，省略时由适配器提供默认值。 */
  args: z.array(z.string()).optional(),
}

/**
 * Agent 定义，仅保存凭据引用。
 * @example
 * ```ts
 * import { ACPAgentSchema } from '@h-ai/ai'
 * const agent = ACPAgentSchema.parse({ id: 'coder', name: 'Coder', mode: 'embedded', adapter: 'codex', modelIds: ['coding'], defaultModelId: 'coding' })
 * ```
 */
export const ACPAgentSchema = z
  .discriminatedUnion('mode', [
    z.strictObject({
      ...common,
      /** 接入模式：自定义远程服务、本机内嵌进程或托管容器。 */
      mode: z.literal('custom-service'),
      /** 智能体原生支持的传输；不自动转换 stdio 和 HTTP/WS。 */
      transport: z.enum(['http', 'ws']),
      /** 远程地址，不允许命令选项和换行。 */
      url: z.url(),
      /** 远程认证 Header 名到宿主变量名的映射。 */
      headerEnv: z.record(z.string(), z.string()).default({}),
      /** 自定义服务显式声明的原生 HTTP/WS 能力。 */
      supportedTransports: z.array(z.enum(['http', 'ws'])).min(1),
    }),
    z.strictObject({
      ...common,
      ...launch,
      /** 接入模式：自定义远程服务、本机内嵌进程或托管容器。 */
      mode: z.literal('embedded'),
      /** 智能体原生支持的传输；不自动转换 stdio 和 HTTP/WS。 */
      transport: z.literal('stdio').default('stdio'),
    }),
    z.strictObject({
      ...common,
      ...launch,
      /** 接入模式：自定义远程服务、本机内嵌进程或托管容器。 */
      mode: z.literal('builtin-service'),
      /** 智能体原生支持的传输；不自动转换 stdio 和 HTTP/WS。 */
      transport: z.literal('stdio').default('stdio'),
      /** 已部署的 Agent 镜像，工作区和智能体需使用同一镜像。 */
      image: z
        .string()
        .min(1)
        .refine(value => !value.startsWith('-')),
      /** auto 优先可用 Podman，再选 Docker；显式选择不自动降级。 */
      engine: z.enum(['auto', 'podman', 'docker']).default('auto'),
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      value.defaultModelId
      && !value.modelIds.includes(value.defaultModelId)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultModelId'],
        message: 'Model binding mismatch',
      })
    }
    if (value.mode === 'custom-service') {
      const protocol = new URL(value.url).protocol
      if (
        !(
          value.transport === 'http' ? ['http:', 'https:'] : ['ws:', 'wss:']
        ).includes(protocol)
        || !value.supportedTransports.includes(value.transport)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['transport'],
          message: 'Transport mismatch',
        })
      }
      if (value.modelIds.length || value.defaultModelId) {
        ctx.addIssue({
          code: 'custom',
          path: ['modelIds'],
          message: 'External service owns its model configuration',
        })
      }
    }
  })

/**
 * 会话 Git 发布请求。
 * @example
 * ```ts
 * import { ACPPublishSchema } from '@h-ai/ai'
 * const request = ACPPublishSchema.parse({ mode: 'push-branch', message: 'Implement task', author: { name: 'Developer', email: 'developer@example.com' } })
 * ```
 */
export const ACPPublishSchema = z.strictObject({
  /** 发布到登记的主分支，或以同名会话分支推送到各工程。 */
  mode: z.enum(['merge-main', 'push-branch']),
  /** 非空 Git 提交说明。 */
  message: z.string().min(1).max(10000),
  /** Git 提交身份，由调用方明确提供。 */
  author: z.strictObject({
    /** Git 提交者名称，不允许换行或尖括号。 */
    name: z
      .string()
      .min(1)
      .refine(value => !/[\r\n<>]/.test(value)),
    /** Git 提交者邮箱。 */
    email: z.email(),
  }),
})
/**
 * 内部标识校验。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const sessionId = sessionIdentitySchema.parse('task-1')
 * ```
 */
export const sessionIdentitySchema = acpIdSchema
/**
 * 内部 Git 分支校验。
 * @example
 * ```ts
 * // 模块内部上下文。
 * const branch = branchNameSchema.parse('task/change')
 * ```
 */
export const branchNameSchema = branch

/**
 * ACP 执行限制。
 * @example
 * ```ts
 * import { ACPConfigSchema } from '@h-ai/ai'
 * const config = ACPConfigSchema.parse({ promptTimeout: 300000 })
 * ```
 */
export const ACPConfigSchema = z.strictObject({
  /** 配置文件定义的只读智能体，与数据库记录按 ID 合并。 */
  agents: z.array(ACPAgentSchema).default([]),
  /** 配置文件定义的只读工作区，与数据库记录按 ID 合并。 */
  workspaces: z.array(ACPWorkspaceSchema).default([]),
  /** 握手和控制请求超时，毫秒。 */
  requestTimeout: z.number().int().positive().default(30000),
  /** 单轮任务超时，毫秒。 */
  promptTimeout: z.number().int().positive().default(600000),
  /** 取消后等待终态的上限，毫秒。 */
  cancelTimeout: z.number().int().positive().default(5000),
  /** 单轮输入和累计输出的字节上限。 */
  maxContentBytes: z
    .number()
    .int()
    .positive()
    .default(8 * 1024 * 1024),
  /** 未消费事件数量上限。 */
  maxPendingEvents: z.number().int().positive().default(1024),
})

/**
 * ACP 初始化配置，已填充超时和只读清单默认值。
 * @example
 * ```ts
 * import { ACPConfigSchema } from '@h-ai/ai'
 * import type { ACPConfig } from '@h-ai/ai'
 * const config: ACPConfig = ACPConfigSchema.parse({ promptTimeout: 300000 })
 * ```
 */
export type ACPConfig = z.output<typeof ACPConfigSchema>
/**
 * ACP 初始化输入，省略字段采用 Schema 默认值。
 * @example
 * ```ts
 * import type { ACPConfigInput } from '@h-ai/ai'
 * const config: ACPConfigInput = { promptTimeout: 300000 }
 * ```
 */
export type ACPConfigInput = z.input<typeof ACPConfigSchema>
