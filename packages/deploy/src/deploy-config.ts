/**
 * @h-ai/deploy — 部署配置 Schema
 *
 * 本文件定义部署模块的 Zod Schema 和配置类型；错误定义位于 deploy-types.ts。
 * @module deploy-config
 */

import { z } from 'zod'
import { deployM } from './deploy-i18n.js'

// ─── Provider 配置 Schema ───

/** Vercel 部署平台配置 */
const VercelProviderConfigSchema = z.object({
  type: z.literal('vercel'),
  token: z.string().min(1, deployM('deploy_configTokenRequired')),
})

/** SSH 连接配置（docker-ssh Provider 使用 OpenSSH 客户端连接远程主机） */
const SshConfigSchema = z.object({
  /** 远程主机地址或 ~/.ssh/config 中的 Host 别名 */
  host: z.string().regex(/^[a-z0-9][a-z0-9.:-]*$/i),
  /** SSH 端口 */
  port: z.number().int().min(1).max(65535).default(22),
  /** SSH 用户名 */
  username: z.string().regex(/^[a-z_][\w-]*$/i),
  /** 私钥文件路径（省略时使用 ssh-agent 或 ~/.ssh 默认密钥） */
  identityFile: z.string().min(1).optional(),
  /** known_hosts 文件路径（省略时使用默认；配合 CI/临时环境隔离主机指纹） */
  knownHostsFile: z.string().min(1).optional(),
  /** 严格主机密钥校验，默认开启（true→accept-new 首次信任并拒绝变更；false→关闭校验） */
  strictHostKeyChecking: z.boolean().default(true),
  /** 连接超时（秒） */
  connectTimeoutSeconds: z.number().int().positive().default(10),
})

/** 端口直出暴露配置 */
const PortExposeSchema = z.object({
  type: z.literal('port').default('port'),
  /** 容器内监听端口（adapter-node 默认 3000） */
  containerPort: z.number().int().min(1).max(65535).default(3000),
  /** 宿主机映射端口 */
  hostPort: z.number().int().min(1).max(65535),
})

/** 应用暴露配置（MVP 仅支持端口直出，域名网关为后续能力） */
const ExposeSchema = PortExposeSchema

/** docker-ssh 部署平台配置 */
const DockerSshProviderConfigSchema = z.object({
  type: z.literal('docker-ssh'),
  /** SSH 连接参数 */
  ssh: SshConfigSchema.optional(),
  /** 远程主机运行参数 */
  remote: z.object({
    /** 远程应用根目录 */
    baseDir: z.string().regex(/^\/[\w/. -]+$/).refine(value => !value.split('/').includes('..')).default('/opt/hai/apps'),
    /** 远程容器运行时（auto 优先 podman） */
    runtime: z.enum(['auto', 'docker', 'podman']).default('auto'),
  }).default({ baseDir: '/opt/hai/apps', runtime: 'auto' }),
  /** 应用暴露方式 */
  expose: ExposeSchema,
})

/**
 * 部署平台配置联合类型（后续可扩展更多平台）
 * 按 type 区分 Vercel 与 docker-ssh；仅校验配置形状，不验证远端连通性或云凭据。
 * @example
 * ```ts
 * import { ProviderConfigSchema } from '@h-ai/deploy'
 * const result = ProviderConfigSchema.safeParse({ type: 'docker-ssh', expose: { hostPort: 8080 } })
 * if (!result.success) throw new Error('Invalid deployment provider')
 * const provider = result.data
 * ```
 */
export const ProviderConfigSchema = z.discriminatedUnion('type', [
  VercelProviderConfigSchema,
  DockerSshProviderConfigSchema,
])

/**
 * SSH 连接配置（parse 后）
 * 这是 Schema 解析后的类型，默认字段已必填；私钥路径可省略以使用 ssh-agent/默认密钥。
 * @example
 * ```ts
 * import type { SshConfig } from '@h-ai/deploy'
 * const config: SshConfig = { host: 'deploy.example.net', username: 'deploy', port: 22, strictHostKeyChecking: true, connectTimeoutSeconds: 10 }
 * ```
 */
export type SshConfig = z.infer<typeof SshConfigSchema>

/**
 * 端口暴露配置（parse 后）
 * @example
 * ```ts
 * import type { PortExposeConfig } from '@h-ai/deploy'
 * const ports: PortExposeConfig = { type: 'port', hostPort: 8080, containerPort: 3000 }
 * ```
 */
export type PortExposeConfig = z.infer<typeof PortExposeSchema>

/**
 * docker-ssh 部署平台配置（parse 后）
 * SSH 可省略用于离线打包；真正在线发布必须提供 SSH 配置。
 * @example
 * ```ts
 * import type { DockerSshProviderConfig } from '@h-ai/deploy'
 * const provider: DockerSshProviderConfig = { type: 'docker-ssh', remote: { baseDir: '/opt/hai/apps', runtime: 'auto' }, expose: { type: 'port', hostPort: 8080, containerPort: 3000 } }
 * ```
 */
export type DockerSshProviderConfig = z.infer<typeof DockerSshProviderConfigSchema>

// ─── Provisioner 配置 Schema ───

/** Neon PostgreSQL 服务配置 */
const NeonServiceSchema = z.object({
  provisioner: z.literal('neon'),
  apiKey: z.string().min(1),
})

/** Upstash Redis 服务配置 */
const UpstashServiceSchema = z.object({
  provisioner: z.literal('upstash'),
  email: z.string().email(),
  apiKey: z.string().min(1),
})

/** Cloudflare R2 存储服务配置 */
const R2ServiceSchema = z.object({
  provisioner: z.literal('cloudflare-r2'),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  accountId: z.string().min(1),
  apiToken: z.string().min(1),
})

/** Resend 邮件服务配置 */
const ResendServiceSchema = z.object({
  provisioner: z.literal('resend'),
  from: z.string().email(),
  apiKey: z.string().min(1),
})

/** 阿里云短信服务配置 */
const AliyunSmsServiceSchema = z.object({
  provisioner: z.literal('aliyun'),
  signName: z.string().min(1),
  accessKeyId: z.string().min(1),
  accessKeySecret: z.string().min(1),
})

/** 基础设施服务配置 */
const ServicesConfigSchema = z.object({
  db: z.discriminatedUnion('provisioner', [NeonServiceSchema]).optional(),
  cache: z.discriminatedUnion('provisioner', [UpstashServiceSchema]).optional(),
  storage: z.discriminatedUnion('provisioner', [R2ServiceSchema]).optional(),
  email: z.discriminatedUnion('provisioner', [ResendServiceSchema]).optional(),
  sms: z.discriminatedUnion('provisioner', [AliyunSmsServiceSchema]).optional(),
}).optional()

// ─── 完整配置 Schema ───

/**
 * 部署模块完整配置 Schema
 * @example
 * ```ts
 * import { DeployConfigSchema } from '@h-ai/deploy'
 * const parsed = DeployConfigSchema.safeParse({ environment: 'prod', provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } })
 * if (!parsed.success) throw new Error('Invalid deployment configuration')
 * const baseDir = parsed.data.provider.type === 'docker-ssh' ? parsed.data.provider.remote.baseDir : undefined
 * ```
 */
export const DeployConfigSchema = z.object({
  /** 部署环境文件模式；dev/test/prod 或自定义模式，禁止 local/example。 */
  environment: z.string().regex(/^[a-z0-9][\w-]*$/i).refine(value => !['local', 'example'].includes(value.toLowerCase())).optional(),
  provider: ProviderConfigSchema,
  services: ServicesConfigSchema,
  /** Docker Compose 部署参数；构建配置位于项目 hai.json.build。 */
  container: z.object({
    /** 自建 S3 服务实现；协议仍为 storage.type=s3。 */
    s3Engine: z.enum(['rustfs', 'minio']).default('rustfs'),
  }).optional(),
})

/**
 * 部署配置类型（parse 后）
 * @example
 * ```ts
 * import type { DeployConfig } from '@h-ai/deploy'
 * const config: DeployConfig = { environment: 'prod', provider: { type: 'docker-ssh', remote: { baseDir: '/opt/hai/apps', runtime: 'auto' }, expose: { type: 'port', hostPort: 8080, containerPort: 3000 } } }
 * ```
 */
export type DeployConfig = z.infer<typeof DeployConfigSchema>

/**
 * 部署配置输入类型（用户输入）
 * @example
 * ```ts
 * import type { DeployConfigInput } from '@h-ai/deploy'
 * const input: DeployConfigInput = { provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } } // 由 init 应用 remote 等默认值。
 * ```
 */
export type DeployConfigInput = z.input<typeof DeployConfigSchema>
