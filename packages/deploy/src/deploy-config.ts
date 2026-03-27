/**
 * @h-ai/deploy — 部署配置 Schema
 *
 * 本文件定义部署模块的错误码、Zod Schema 和配置类型。
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
