/**
 * =============================================================================
 * @h-ai/cli - 配置文件模板
 * =============================================================================
 * 为各模块生成默认配置文件内容。
 * =============================================================================
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
# Database (@h-ai/db)
# =============================================================================
# Database type: sqlite | postgresql | mysql
HAI_DB_TYPE=${dbType}
# SQLite: file path; PostgreSQL/MySQL: database name
HAI_DB_DATABASE=${dbDatabase}${isSqlite
  ? `
# PostgreSQL/MySQL connection (uncomment when not using sqlite)
# HAI_DB_HOST=localhost
# HAI_DB_PORT=5432
# HAI_DB_USER=postgres
# HAI_DB_PASSWORD=`
  : `
# Connection
HAI_DB_HOST=${configs?.db?.host ?? 'localhost'}
HAI_DB_PORT=${configs?.db?.port ?? (dbType === 'postgresql' ? 5432 : 3306)}
HAI_DB_USER=${dbType === 'postgresql' ? 'postgres' : 'root'}
HAI_DB_PASSWORD=`}`)
  }

  // IAM / Session
  if (features.includes('iam')) {
    sections.push(`
# =============================================================================
# Session / IAM (@h-ai/iam)
# =============================================================================
# JWT signing secret (REQUIRED, min 32 chars)
HAI_SESSION_SECRET=change-me-to-a-strong-random-string-min-32-chars`)
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
# Anthropic
HAI_ANTHROPIC_API_KEY=
# OpenAI / OpenAI-compatible (uncomment if needed)
# HAI_OPENAI_API_KEY=
# HAI_OPENAI_BASE_URL=`)
    }
    else if (provider === 'openai') {
      sections.push(`
# =============================================================================
# AI (@h-ai/ai)
# =============================================================================
# OpenAI / OpenAI-compatible
HAI_OPENAI_API_KEY=
# HAI_OPENAI_BASE_URL=               # Custom base URL (e.g. local proxy, Azure)
# Anthropic (uncomment if needed)
# HAI_ANTHROPIC_API_KEY=`)
    }
    else {
      sections.push(`
# =============================================================================
# AI (@h-ai/ai)
# =============================================================================
# Generic OpenAI-compatible provider
HAI_AI_API_KEY=
# HAI_AI_BASE_URL=`)
    }
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
