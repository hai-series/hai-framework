/**
 * @h-ai/cli — 配置文件模板
 *
 * 为各模块生成默认配置文件内容。
 * @module config-templates
 */

import type { AiModuleConfig, CacheModuleConfig, CoreModuleConfig, DbModuleConfig, FeatureId, IamModuleConfig, ModuleConfigs, StorageModuleConfig } from '../types.js'

/**
 * 生成模块配置文件内容
 *
 * @param moduleKey - 模块标识（core/db/cache/iam/storage/ai）
 * @param configs - 用户自定义配置值
 * @returns YAML 格式的配置内容
 */
export function generateConfigFile(moduleKey: string, configs?: ModuleConfigs): string {
  switch (moduleKey) {
    case 'core':
      return generateCoreConfig(configs?.core)
    case 'db':
      return generateDbConfig(configs?.db)
    case 'cache':
      return generateCacheConfig(configs?.cache)
    case 'iam':
      return generateIamConfig(configs?.iam)
    case 'storage':
      return generateStorageConfig(configs?.storage)
    case 'ai':
      return generateAiConfig(configs?.ai)
    case 'deploy':
      return generateDeployConfig()
    case 'vecdb':
      return generateVecdbConfig()
    case 'reach':
      return generateReachConfig()
    case 'scheduler':
      return generateSchedulerConfig()
    case 'audit':
      return generateAuditConfig()
    case 'payment':
      return generatePaymentConfig()
    default:
      return `# ${moduleKey} 配置\n`
  }
}

function generateCoreConfig(cfg?: CoreModuleConfig): string {
  const name = cfg?.name ?? 'my-app'
  const locale = cfg?.defaultLocale ?? 'zh-CN'
  const supportedLocales = locale === 'en-US'
    ? `  - en-US\n  - zh-CN`
    : `  - zh-CN\n  - en-US`

  return `# =============================================================================
# 应用配置
# =============================================================================

name: ${name}
version: 0.1.0
env: \${HAI_ENV:development}
debug: \${HAI_DEBUG:false}

defaultLocale: ${locale}
supportedLocales:
${supportedLocales}
`
}

function generateDbConfig(cfg?: DbModuleConfig): string {
  const dbType = cfg?.type ?? 'sqlite'
  const database = cfg?.database ?? (dbType === 'sqlite' ? './data/app.db' : 'hai')
  const host = cfg?.host ?? 'localhost'
  const port = cfg?.port ?? (dbType === 'postgresql' ? 5432 : 3306)

  if (dbType === 'sqlite') {
    return `# =============================================================================
# 数据库配置
# =============================================================================

# 数据库类型: sqlite | postgresql | mysql
type: sqlite

# SQLite 数据库路径
database: \${HAI_RELDB_DATABASE:${database}}

# PostgreSQL/MySQL 配置（可选）
# host: \${HAI_RELDB_HOST:localhost}
# port: \${HAI_RELDB_PORT:5432}
# user: \${HAI_RELDB_USER:postgres}
# password: \${HAI_RELDB_PASSWORD:}
`
  }

  const user = dbType === 'postgresql' ? 'postgres' : 'root'

  return `# =============================================================================
# 数据库配置
# =============================================================================

# 数据库类型: sqlite | postgresql | mysql
type: ${dbType}

# 数据库名称
database: \${HAI_RELDB_DATABASE:${database}}

# 连接配置
host: \${HAI_RELDB_HOST:${host}}
port: \${HAI_RELDB_PORT:${port}}
user: \${HAI_RELDB_USER:${user}}
password: \${HAI_RELDB_PASSWORD:}
`
}

function generateCacheConfig(cfg?: CacheModuleConfig): string {
  const cacheType = cfg?.type ?? 'memory'

  if (cacheType === 'memory') {
    return `# =============================================================================
# 缓存配置
# =============================================================================

# 缓存类型: memory | redis
type: memory

# Redis 配置（当 type 为 redis 时使用）
# url: \${HAI_CACHE_REDIS_URL:redis://localhost:6379/0}
# host: \${HAI_CACHE_REDIS_HOST:localhost}
# port: \${HAI_CACHE_REDIS_PORT:6379}
# password: \${HAI_CACHE_REDIS_PASSWORD:}
# keyPrefix: \${HAI_CACHE_KEY_PREFIX:hai:}
`
  }

  const host = cfg?.host ?? 'localhost'
  const port = cfg?.port ?? 6379

  return `# =============================================================================
# 缓存配置
# =============================================================================

# 缓存类型: memory | redis
type: redis

# Redis 配置
host: \${HAI_CACHE_REDIS_HOST:${host}}
port: \${HAI_CACHE_REDIS_PORT:${port}}
password: \${HAI_CACHE_REDIS_PASSWORD:}
keyPrefix: \${HAI_CACHE_KEY_PREFIX:hai:}
`
}

function generateIamConfig(cfg?: IamModuleConfig): string {
  const loginPassword = cfg?.loginPassword ?? true
  const loginOtp = cfg?.loginOtp ?? false

  return `# =============================================================================
# IAM 配置
# =============================================================================

# 登录配置
login:
  password: ${loginPassword}
  otp: ${loginOtp}
  ldap: false

# 密码策略
password:
  minLength: 8
  maxLength: 128
  requireUppercase: false
  requireLowercase: false
  requireNumber: false
  requireSpecialChar: false

# 会话配置
session:
  maxAge: 86400       # 会话超时（秒），默认 24 小时
  sliding: true       # 滑动窗口（每次请求刷新过期时间）
  singleDevice: false # 单设备登录
  refreshTokenMaxAge: 604800  # refreshToken 过期（秒），默认 7 天

# RBAC 配置
rbac:
  defaultRole: user

# 是否自动创建默认数据
seedDefaultData: true
`
}

function generateStorageConfig(cfg?: StorageModuleConfig): string {
  const storageType = cfg?.type ?? 'local'

  if (storageType === 'local') {
    const localPath = cfg?.localPath ?? './data/uploads'
    return `# =============================================================================
# 存储配置
# =============================================================================

# 默认 Provider
defaultProvider: local

# Provider 配置
providers:
  local:
    type: local
    root: \${HAI_STORAGE_PATH:${localPath}}
    maxFileSize: 10485760  # 10MB

  # S3 配置（可选）
  # s3:
  #   type: s3
  #   bucket: \${HAI_STORAGE_S3_BUCKET}
  #   region: \${HAI_STORAGE_S3_REGION:us-east-1}
  #   accessKeyId: \${HAI_STORAGE_S3_ACCESS_KEY}
  #   secretAccessKey: \${HAI_STORAGE_S3_SECRET_KEY}
  #   endpoint: \${HAI_STORAGE_S3_ENDPOINT}
  #   forcePathStyle: \${HAI_STORAGE_S3_FORCE_PATH_STYLE:false}
`
  }

  return `# =============================================================================
# 存储配置
# =============================================================================

# 默认 Provider
defaultProvider: s3

# Provider 配置
providers:
  s3:
    type: s3
    bucket: \${HAI_STORAGE_S3_BUCKET}
    region: \${HAI_STORAGE_S3_REGION:us-east-1}
    accessKeyId: \${HAI_STORAGE_S3_ACCESS_KEY}
    secretAccessKey: \${HAI_STORAGE_S3_SECRET_KEY}
    # endpoint: \${HAI_STORAGE_S3_ENDPOINT}
    # forcePathStyle: \${HAI_STORAGE_S3_FORCE_PATH_STYLE:false}

  # 本地存储（可选）
  # local:
  #   type: local
  #   root: \${HAI_STORAGE_PATH:./data/uploads}
  #   maxFileSize: 10485760  # 10MB
`
}

function generateAiConfig(cfg?: AiModuleConfig): string {
  const model = cfg?.model ?? 'gpt-4o-mini'

  // AIConfigSchema 结构：llm（必填）+ 可选子模块
  // LLMConfigSchema 支持顶层 apiKey/model，以及多模型 models 数组
  return `# =============================================================================
# AI 配置
# =============================================================================

# LLM 配置（必填）
llm:
  # API Key（留空时自动读取 HAI_AI_LLM_API_KEY / OPENAI_API_KEY 环境变量）
  apiKey: \${HAI_AI_LLM_API_KEY:}
  # Base URL（留空时自动读取 HAI_AI_LLM_BASE_URL / OPENAI_BASE_URL，默认 https://api.openai.com/v1）
  # baseUrl: \${HAI_AI_LLM_BASE_URL:}
  # 默认模型
  model: ${model}
  # 全局最大 Token 数（默认 4096）
  # maxTokens: 4096
  # 采样温度（0-2，默认 0.7）
  # temperature: 0.7
  # 请求超时（毫秒，默认 60000）
  # timeout: 60000

  # 多模型配置（可选，用于场景路由）
  # models:
  #   - id: fast
  #     model: gpt-4o-mini
  #   - id: smart
  #     model: gpt-4o
  #     apiKey: \${HAI_AI_LLM_API_KEY:}

  # 场景模型映射（可选）
  # scenarios:
  #   default: fast
  #   analysis: smart
`
}

/**
 * 根据选中的功能模块生成 .env.example 内容
 *
 * @param features - 选中的功能模块列表
 * @param configs - 用户自定义配置值
 * @returns .env.example 文件内容
 */
export function generateEnvExample(features: FeatureId[], configs?: ModuleConfigs): string {
  const sections: string[] = []

  // 文件头
  sections.push(`# =============================================================================
# Environment Variables
# =============================================================================
#
# Copy this file to .env and fill in actual values.
# Config files in config/ reference these variables via \${VAR_NAME:default} syntax.
#
# Naming convention: HAI_<MODULE>_<SETTING>
# =============================================================================`)

  // 应用基础（始终生成）
  sections.push(`
# =============================================================================
# Application
# =============================================================================
# Environment: development | production | test
HAI_ENV=development
# Enable debug mode
HAI_DEBUG=false`)

  // 数据库
  if (features.includes('db')) {
    const dbType = configs?.db?.type ?? 'sqlite'
    const dbDatabase = configs?.db?.database ?? (dbType === 'sqlite' ? './data/app.db' : 'hai')
    const isSqlite = dbType === 'sqlite'
    sections.push(`
# =============================================================================
# Database (@h-ai/reldb)
# =============================================================================
# Database type: sqlite | postgresql | mysql
HAI_RELDB_TYPE=${dbType}
# SQLite: file path; PostgreSQL/MySQL: database name
HAI_RELDB_DATABASE=${dbDatabase}${isSqlite
  ? `
# PostgreSQL/MySQL connection (uncomment when not using sqlite)
# HAI_RELDB_HOST=localhost
# HAI_RELDB_PORT=5432
# HAI_RELDB_USER=postgres
# HAI_RELDB_PASSWORD=`
  : `
# Connection
HAI_RELDB_HOST=${configs?.db?.host ?? 'localhost'}
HAI_RELDB_PORT=${configs?.db?.port ?? (dbType === 'postgresql' ? 5432 : 3306)}
HAI_RELDB_USER=${dbType === 'postgresql' ? 'postgres' : 'root'}
HAI_RELDB_PASSWORD=`}`)
  }

  // IAM / Session
  if (features.includes('iam')) {
    sections.push(`
# =============================================================================
# IAM (@h-ai/iam)
# =============================================================================
HAI_IAM_SESSION_SECRET=change-me-to-a-strong-random-string-min-32-chars
# HAI_IAM_PASSWORD_MIN_LENGTH=8
# HAI_IAM_SESSION_MAX_AGE=86400
# HAI_IAM_REFRESH_TOKEN_MAX_AGE=604800
# HAI_IAM_MAX_LOGIN_ATTEMPTS=5
# HAI_KIT_COOKIE_KEY=                 # 32-char hex for SM4-CBC cookie encryption
`)
  }

  // 缓存
  if (features.includes('cache')) {
    const cacheType = configs?.cache?.type ?? 'memory'
    if (cacheType === 'redis') {
      sections.push(`
# =============================================================================
# Cache (@h-ai/cache)
# =============================================================================
# Cache type: memory | redis
HAI_CACHE_TYPE=redis
# Redis connection
HAI_CACHE_REDIS_HOST=${configs?.cache?.host ?? 'localhost'}
HAI_CACHE_REDIS_PORT=${configs?.cache?.port ?? 6379}
HAI_CACHE_REDIS_PASSWORD=
# HAI_CACHE_REDIS_URL=redis://localhost:6379/0
# HAI_CACHE_REDIS_DB=0
# HAI_CACHE_CONNECT_TIMEOUT=10000
# HAI_CACHE_COMMAND_TIMEOUT=5000
# HAI_CACHE_KEY_PREFIX=hai:`)
    }
    else {
      sections.push(`
# =============================================================================
# Cache (@h-ai/cache)
# =============================================================================
# Cache type: memory | redis
HAI_CACHE_TYPE=memory
# Redis connection (uncomment when type=redis)
# HAI_CACHE_REDIS_URL=redis://localhost:6379/0
# HAI_CACHE_REDIS_HOST=localhost
# HAI_CACHE_REDIS_PORT=6379
# HAI_CACHE_REDIS_PASSWORD=
# HAI_CACHE_REDIS_DB=0
# HAI_CACHE_CONNECT_TIMEOUT=10000
# HAI_CACHE_COMMAND_TIMEOUT=5000
# HAI_CACHE_KEY_PREFIX=hai:`)
    }
  }

  // 存储
  if (features.includes('storage')) {
    const storageType = configs?.storage?.type ?? 'local'
    if (storageType === 's3') {
      sections.push(`
# =============================================================================
# Storage (@h-ai/storage)
# =============================================================================
# Storage type: local | s3
HAI_STORAGE_TYPE=s3
# S3 / S3-compatible
HAI_STORAGE_S3_BUCKET=
HAI_STORAGE_S3_REGION=us-east-1
HAI_STORAGE_S3_ACCESS_KEY=
HAI_STORAGE_S3_SECRET_KEY=
# HAI_STORAGE_S3_ENDPOINT=          # Custom endpoint for MinIO / Aliyun OSS etc.
# HAI_STORAGE_S3_FORCE_PATH_STYLE=false
# Local storage (uncomment when type=local)
# HAI_STORAGE_PATH=./data/uploads`)
    }
    else {
      sections.push(`
# =============================================================================
# Storage (@h-ai/storage)
# =============================================================================
# Storage type: local | s3
HAI_STORAGE_TYPE=local
# Local storage root path
HAI_STORAGE_PATH=${configs?.storage?.localPath ?? './data/uploads'}
# S3 / S3-compatible (uncomment when type=s3)
# HAI_STORAGE_S3_BUCKET=
# HAI_STORAGE_S3_REGION=us-east-1
# HAI_STORAGE_S3_ACCESS_KEY=
# HAI_STORAGE_S3_SECRET_KEY=
# HAI_STORAGE_S3_ENDPOINT=          # Custom endpoint for MinIO / Aliyun OSS etc.
# HAI_STORAGE_S3_FORCE_PATH_STYLE=false`)
    }
  }

  // AI
  if (features.includes('ai')) {
    const provider = configs?.ai?.defaultProvider ?? 'openai'
    if (provider === 'anthropic') {
      sections.push(`
# =============================================================================
# AI (@h-ai/ai)
# =============================================================================
# OpenAI-compatible API Key (Anthropic models via OpenAI-compatible proxy)
HAI_AI_LLM_API_KEY=
# HAI_AI_LLM_BASE_URL=               # Custom base URL
# Optional compatibility fallback
# OPENAI_API_KEY=`)
    }
    else if (provider === 'openai') {
      sections.push(`
# =============================================================================
# AI (@h-ai/ai)
# =============================================================================
# OpenAI / OpenAI-compatible
HAI_AI_LLM_API_KEY=
# HAI_AI_LLM_BASE_URL=               # Custom base URL (e.g. local proxy, Azure)
# Optional compatibility fallback
# OPENAI_API_KEY=`)
    }
    else {
      sections.push(`
# =============================================================================
# AI (@h-ai/ai)
# =============================================================================
# OpenAI-compatible provider
HAI_AI_LLM_API_KEY=
# HAI_AI_LLM_BASE_URL=               # Custom base URL
# Optional compatibility fallback
# OPENAI_API_KEY=`)
    }
  }

  // VecDB
  if (features.includes('vecdb')) {
    sections.push(`
# =============================================================================
# Vector Database (@h-ai/vecdb)
# =============================================================================
# Backend type: lancedb | pgvector | qdrant
HAI_VECDB_TYPE=lancedb
# LanceDB data path
HAI_VECDB_PATH=./data/vecdb
# Qdrant (uncomment when type=qdrant)
# HAI_VECDB_QDRANT_URL=http://localhost:6333
# HAI_VECDB_QDRANT_API_KEY=
`)
  }

  // Reach
  if (features.includes('reach')) {
    sections.push(`
# =============================================================================
# Reach (@h-ai/reach)
# =============================================================================
# SMTP (uncomment when enabling email provider)
# HAI_REACH_SMTP_HOST=smtp.example.com
# HAI_REACH_SMTP_PORT=465
# HAI_REACH_SMTP_USER=
# HAI_REACH_SMTP_PASS=
# HAI_REACH_SMTP_FROM=noreply@example.com
`)
  }

  // Payment
  if (features.includes('payment')) {
    sections.push(`
# =============================================================================
# Payment (@h-ai/payment)
# =============================================================================
# WeChat Pay
# HAI_PAYMENT_WECHAT_MCH_ID=
# HAI_PAYMENT_WECHAT_API_V3_KEY=
# HAI_PAYMENT_WECHAT_SERIAL_NO=
# HAI_PAYMENT_WECHAT_PRIVATE_KEY=
# HAI_PAYMENT_WECHAT_APP_ID=
# Alipay
# HAI_PAYMENT_ALIPAY_APP_ID=
# HAI_PAYMENT_ALIPAY_PRIVATE_KEY=
# HAI_PAYMENT_ALIPAY_PUBLIC_KEY=
# Stripe
# HAI_PAYMENT_STRIPE_SECRET_KEY=
# HAI_PAYMENT_STRIPE_WEBHOOK_SECRET=
`)
  }

  // 测试（始终生成）
  sections.push(`
# =============================================================================
# Testing
# =============================================================================
# E2E test mode (relaxes rate limiting etc.)
# HAI_E2E=1
`)

  return sections.join('\n')
}

function generateDeployConfig(): string {
  return `# =============================================================================
# 部署配置 (@h-ai/deploy)
# =============================================================================
# 部署平台凭证通过 ~/.hai/credentials.yml 管理
# 环境变量引用格式: \${VAR_NAME:default_value}

# 部署平台
provider:
  type: vercel
  token: \${HAI_DEPLOY_VERCEL_TOKEN}

# 基础设施服务（按需开启）
services:
  # PostgreSQL 数据库 (Neon)
  # db:
  #   provisioner: neon
  #   apiKey: \${HAI_DEPLOY_NEON_API_KEY}

  # Redis 缓存 (Upstash)
  # cache:
  #   provisioner: upstash
  #   email: \${HAI_DEPLOY_UPSTASH_EMAIL}
  #   apiKey: \${HAI_DEPLOY_UPSTASH_API_KEY}

  # S3 存储 (Cloudflare R2)
  # storage:
  #   provisioner: cloudflare-r2
  #   accountId: \${HAI_DEPLOY_CF_ACCOUNT_ID}
  #   apiToken: \${HAI_DEPLOY_CF_API_TOKEN}

  # 邮件 (Resend)
  # email:
  #   provisioner: resend
  #   apiKey: \${HAI_DEPLOY_RESEND_API_KEY}

  # 短信 (阿里云)
  # sms:
  #   provisioner: aliyun
  #   accessKeyId: \${HAI_DEPLOY_ALIYUN_ACCESS_KEY_ID}
  #   accessKeySecret: \${HAI_DEPLOY_ALIYUN_ACCESS_KEY_SECRET}
`
}

function generateVecdbConfig(): string {
  return `# =============================================================================
# 向量数据库配置 (@h-ai/vecdb)
# =============================================================================

# 数据库类型: lancedb | pgvector | qdrant
type: lancedb

# LanceDB 数据目录
path: \${HAI_VECDB_PATH:./data/vecdb}

# 距离度量: cosine | euclidean | dot
# metric: cosine

# pgvector 配置（当 type 为 pgvector 时使用）
# type: pgvector
# host: \${HAI_RELDB_HOST:localhost}
# port: \${HAI_RELDB_PORT:5432}
# database: \${HAI_RELDB_DATABASE:hai}
# user: \${HAI_RELDB_USER:postgres}
# password: \${HAI_RELDB_PASSWORD:}
# indexType: hnsw
# tablePrefix: vec_

# Qdrant 配置（当 type 为 qdrant 时使用）
# type: qdrant
# url: \${HAI_VECDB_QDRANT_URL:http://localhost:6333}
# apiKey: \${HAI_VECDB_QDRANT_API_KEY:}
`
}

function generateReachConfig(): string {
  return `# =============================================================================
# 消息推送配置 (@h-ai/reach)
# =============================================================================

providers:
  # 控制台输出（开发/测试用）
  - name: console_dev
    type: console

  # SMTP 邮件（按需开启）
  # - name: email
  #   type: smtp
  #   host: \${HAI_REACH_SMTP_HOST:smtp.example.com}
  #   port: \${HAI_REACH_SMTP_PORT:465}
  #   secure: true
  #   user: \${HAI_REACH_SMTP_USER:}
  #   pass: \${HAI_REACH_SMTP_PASS:}
  #   from: \${HAI_REACH_SMTP_FROM:noreply@example.com}

  # 阿里云短信（按需开启）
  # - name: sms
  #   type: aliyun-sms
  #   accessKeyId: \${HAI_REACH_SMS_ACCESS_KEY}
  #   accessKeySecret: \${HAI_REACH_SMS_SECRET_KEY}
  #   signName: MyApp

# 模板（可选）
# templates:
#   - name: verification_code
#     provider: email
#     subject: "验证码: {code}"
#     body: "您的验证码是 {code}，有效期 {minutes} 分钟。"

# 免打扰（可选）
# dnd:
#   enabled: true
#   strategy: delay
#   start: "22:00"
#   end: "08:00"
`
}

function generateSchedulerConfig(): string {
  return `# =============================================================================
# 任务调度配置 (@h-ai/scheduler)
# =============================================================================

# 是否启用数据库日志（需要 @h-ai/reldb）
enableDb: true

# 执行日志表名
tableName: hai_scheduler_logs

# 任务定义表名
taskTableName: hai_scheduler_tasks

# 分布式锁表名
lockTableName: hai_scheduler_locks

# 检查间隔（毫秒）
tickInterval: 1000

# 锁过期时间（毫秒）
lockExpireMs: 300000
`
}

function generateAuditConfig(): string {
  return `# =============================================================================
# 审计日志配置 (@h-ai/audit)
# =============================================================================

# 审计日志表名
tableName: hai_audit_logs

# 用户表名（用于 JOIN 查询）
userTable: hai_iam_users

# 用户表主键列名
userIdColumn: id

# 用户名列名
userNameColumn: username
`
}

function generatePaymentConfig(): string {
  return `# =============================================================================
# 支付配置 (@h-ai/payment)
# =============================================================================

# 微信支付（按需开启）
# wechat:
#   mchId: \${HAI_PAYMENT_WECHAT_MCH_ID}
#   apiV3Key: \${HAI_PAYMENT_WECHAT_API_V3_KEY}
#   serialNo: \${HAI_PAYMENT_WECHAT_SERIAL_NO}
#   privateKey: \${HAI_PAYMENT_WECHAT_PRIVATE_KEY}
#   appId: \${HAI_PAYMENT_WECHAT_APP_ID}

# 支付宝（按需开启）
# alipay:
#   appId: \${HAI_PAYMENT_ALIPAY_APP_ID}
#   privateKey: \${HAI_PAYMENT_ALIPAY_PRIVATE_KEY}
#   alipayPublicKey: \${HAI_PAYMENT_ALIPAY_PUBLIC_KEY}
#   signType: RSA2
#   sandbox: false

# Stripe（按需开启）
# stripe:
#   secretKey: \${HAI_PAYMENT_STRIPE_SECRET_KEY}
#   webhookSecret: \${HAI_PAYMENT_STRIPE_WEBHOOK_SECRET}
`
}
