/**
 * =============================================================================
 * @hai/cli - 配置文件模板
 * =============================================================================
 * 为各模块生成默认配置文件内容。
 * =============================================================================
 */

/**
 * 生成模块配置文件内容
 *
 * @param moduleKey - 模块标识（core/db/cache/iam/storage/ai）
 * @returns YAML 格式的配置内容
 */
export function generateConfigFile(moduleKey: string): string {
  const generators: Record<string, () => string> = {
    core: generateCoreConfig,
    db: generateDbConfig,
    cache: generateCacheConfig,
    iam: generateIamConfig,
    storage: generateStorageConfig,
    ai: generateAiConfig,
  }

  const generator = generators[moduleKey]
  if (!generator) {
    return `# ${moduleKey} 配置\n`
  }
  return generator()
}

function generateCoreConfig(): string {
  return `# =============================================================================
# 应用配置
# =============================================================================

name: my-app
version: 0.1.0
env: \${HAI_ENV:development}
debug: false

defaultLocale: zh-CN
supportedLocales:
  - zh-CN
  - en-US
`
}

function generateDbConfig(): string {
  return `# =============================================================================
# 数据库配置
# =============================================================================

# 数据库类型: sqlite | postgresql | mysql
type: \${HAI_DB_TYPE:sqlite}

# SQLite 数据库路径，或 PostgreSQL/MySQL 连接字符串
database: \${HAI_DB_DATABASE:./data/app.db}

# PostgreSQL/MySQL 配置（可选）
# host: \${HAI_DB_HOST:localhost}
# port: \${HAI_DB_PORT:5432}
# user: \${HAI_DB_USER:postgres}
# password: \${HAI_DB_PASSWORD:}
`
}

function generateCacheConfig(): string {
  return `# =============================================================================
# 缓存配置
# =============================================================================

# 缓存类型: memory | redis
type: \${HAI_CACHE_TYPE:memory}

# Redis 配置（当 type 为 redis 时使用）
# url: \${HAI_CACHE_REDIS_URL:redis://localhost:6379/0}
# host: \${HAI_CACHE_REDIS_HOST:localhost}
# port: \${HAI_CACHE_REDIS_PORT:6379}
# password: \${HAI_CACHE_REDIS_PASSWORD:}
# keyPrefix: \${HAI_CACHE_KEY_PREFIX:hai:}
`
}

function generateIamConfig(): string {
  return `# =============================================================================
# IAM 配置
# =============================================================================

# 登录配置
login:
  password: true
  otp: false
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

function generateStorageConfig(): string {
  return `# =============================================================================
# 存储配置
# =============================================================================

# 默认 Provider
defaultProvider: local

# Provider 配置
providers:
  local:
    type: local
    basePath: \${HAI_STORAGE_PATH:./data/uploads}
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

function generateAiConfig(): string {
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
    model: gpt-4o-mini

  # 其他 Provider（可选）
  # anthropic:
  #   type: anthropic
  #   apiKey: \${HAI_ANTHROPIC_API_KEY}
  #   model: claude-3-sonnet
`
}
