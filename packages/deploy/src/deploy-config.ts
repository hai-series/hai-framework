/**
 * @h-ai/deploy — 部署配置 Schema
 *
 * 本文件定义部署模块的错误码、Zod Schema 和配置类型。
 * @module deploy-config
 */

import { z } from 'zod'
import { deployM } from './deploy-i18n.js'

// ─── 错误码常量 ───

/**
 * 部署错误码（数值范围 9000-9099）
 *
 * 用于标识部署操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { DeployErrorCode } from '@h-ai/deploy'
 *
 * if (result.error?.code === DeployErrorCode.AUTH_REQUIRED) {
 *   // 处理错误：需要认证
 * }
 * ```
 */
export const DeployErrorCode = {
  /** 部署失败（通用） */
  DEPLOY_FAILED: 9000,
  /** 平台项目创建失败 */
  PROJECT_CREATE_FAILED: 9001,
  /** 应用构建失败 */
  BUILD_FAILED: 9002,
  /** 构建产物上传失败 */
  UPLOAD_FAILED: 9003,
  /** 未认证 */
  AUTH_REQUIRED: 9004,
  /** 认证失败 */
  AUTH_FAILED: 9005,
  /** 基础设施开通失败 */
  PROVISION_FAILED: 9006,
  /** SvelteKit adapter 未安装 */
  ADAPTER_MISSING: 9007,
  /** 应用扫描失败 */
  SCAN_FAILED: 9008,
  /** 环境变量设置失败 */
  ENV_VAR_FAILED: 9009,
  /** 模块未初始化 */
  NOT_INITIALIZED: 9010,
  /** 不支持的 Provider/Provisioner 类型 */
  UNSUPPORTED_TYPE: 9011,
  /** 配置错误 */
  CONFIG_ERROR: 9012,
  /** 凭证读写失败 */
  CREDENTIAL_ERROR: 9013,
} as const

/** 部署错误码类型 */
export type DeployErrorCodeType = (typeof DeployErrorCode)[keyof typeof DeployErrorCode]

// ─── Provider 配置 Schema ───

/** Vercel 部署平台配置 */
const VercelProviderConfigSchema = z.object({
  type: z.literal('vercel'),
  token: z.string().min(1, deployM('deploy_configTokenRequired')),
})

/** 部署平台配置联合类型（后续可扩展更多平台） */
export const ProviderConfigSchema = z.discriminatedUnion('type', [
  VercelProviderConfigSchema,
])

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
  accountId: z.string().min(1),
  apiToken: z.string().min(1),
})

/** Resend 邮件服务配置 */
const ResendServiceSchema = z.object({
  provisioner: z.literal('resend'),
  apiKey: z.string().min(1),
})

/** 阿里云短信服务配置 */
const AliyunSmsServiceSchema = z.object({
  provisioner: z.literal('aliyun'),
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

/** 部署模块完整配置 Schema */
export const DeployConfigSchema = z.object({
  provider: ProviderConfigSchema,
  services: ServicesConfigSchema,
})

/** 部署配置类型（parse 后） */
export type DeployConfig = z.infer<typeof DeployConfigSchema>

/** 部署配置输入类型（用户输入） */
export type DeployConfigInput = z.input<typeof DeployConfigSchema>
