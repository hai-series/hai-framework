/**
 * =============================================================================
 * @hai/cli - 配置文件模板
 * =============================================================================
 * 为各模块生成默认配置文件内容。
 * =============================================================================
 */

import type { AiModuleConfig, CacheModuleConfig, CoreModuleConfig, DbModuleConfig, IamModuleConfig, ModuleConfigs, StorageModuleConfig } from '../types.js'

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
debug: false

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
database: \${HAI_DB_DATABASE:${database}}

# PostgreSQL/MySQL 配置（可选）
# host: \${HAI_DB_HOST:localhost}
# port: \${HAI_DB_PORT:5432}
# user: \${HAI_DB_USER:postgres}
# password: \${HAI_DB_PASSWORD:}
`
  }

  const user = dbType === 'postgresql' ? 'postgres' : 'root'

  return `# =============================================================================
# 数据库配置
# =============================================================================

# 数据库类型: sqlite | postgresql | mysql
type: ${dbType}

# 数据库名称
database: \${HAI_DB_DATABASE:${database}}

# 连接配置
host: \${HAI_DB_HOST:${host}}
port: \${HAI_DB_PORT:${port}}
user: \${HAI_DB_USER:${user}}
password: \${HAI_DB_PASSWORD:}
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
  type: jwt
  jwt:
    secret: \${HAI_SESSION_SECRET}
    algorithm: HS256
    accessTokenExpiresIn: 900
    refreshTokenExpiresIn: 604800

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
    basePath: \${HAI_STORAGE_PATH:${localPath}}
    maxFileSize: 10485760  # 10MB

  # S3 配置（可选）
  # s3:
  #   type: s3
  #   bucket: \${HAI_S3_BUCKET}
  #   region: \${HAI_S3_REGION:us-east-1}
  #   accessKeyId: \${HAI_S3_ACCESS_KEY}
  #   secretAccessKey: \${HAI_S3_SECRET_KEY}
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
    bucket: \${HAI_S3_BUCKET}
    region: \${HAI_S3_REGION:us-east-1}
    accessKeyId: \${HAI_S3_ACCESS_KEY}
    secretAccessKey: \${HAI_S3_SECRET_KEY}

  # 本地存储（可选）
  # local:
  #   type: local
  #   basePath: \${HAI_STORAGE_PATH:./data/uploads}
  #   maxFileSize: 10485760  # 10MB
`
}

function generateAiConfig(cfg?: AiModuleConfig): string {
  const provider = cfg?.defaultProvider ?? 'openai'
  const model = cfg?.model ?? 'gpt-4o-mini'

  if (provider === 'openai') {
    return `# =============================================================================
# AI 配置
# =============================================================================

# 默认 Provider
defaultProvider: openai

# Provider 配置
providers:
  openai:
    type: openai
    apiKey: \${HAI_OPENAI_API_KEY}
    model: ${model}

  # 其他 Provider（可选）
  # anthropic:
  #   type: anthropic
  #   apiKey: \${HAI_ANTHROPIC_API_KEY}
  #   model: claude-3-sonnet
`
  }

  if (provider === 'anthropic') {
    return `# =============================================================================
# AI 配置
# =============================================================================

# 默认 Provider
defaultProvider: anthropic

# Provider 配置
providers:
  anthropic:
    type: anthropic
    apiKey: \${HAI_ANTHROPIC_API_KEY}
    model: ${model || 'claude-3-sonnet'}

  # 其他 Provider（可选）
  # openai:
  #   type: openai
  #   apiKey: \${HAI_OPENAI_API_KEY}
  #   model: gpt-4o-mini
`
  }

  // 通用 OpenAI 兼容 Provider
  return `# =============================================================================
# AI 配置
# =============================================================================

# 默认 Provider
defaultProvider: ${provider}

# Provider 配置
providers:
  ${provider}:
    type: openai
    apiKey: \${HAI_AI_API_KEY}
    model: ${model}
    # baseUrl: \${HAI_AI_BASE_URL}
`
}
