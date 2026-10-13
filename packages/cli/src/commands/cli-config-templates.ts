/**
 * @h-ai/cli — 配置文件模板
 *
 * 为各模块生成默认配置及按需取消注释的选项；配置字段以模块 Schema 为准。
 * @module cli-config-templates
 */

import type { AiModuleConfig, CacheModuleConfig, CoreModuleConfig, DbModuleConfig, FeatureId, IamModuleConfig, ModuleConfigs, StorageModuleConfig } from '../cli-types.js'
import { stringify } from 'yaml'

/**
 * 生成模块配置文件内容
 *
 * @param moduleKey - 拥有配置 Schema 的模块标识
 * @param configs - 用户自定义配置值
 * @returns YAML 格式的配置内容
 */
export function generateConfigFile(moduleKey: string, configs?: ModuleConfigs): string {
  switch (moduleKey) {
    case 'core':
      return generateCoreConfig(configs?.core)
    case 'serv':
      return generateServConfig()
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

  return `# =============================================================================
# 应用配置
# =============================================================================

${stringify({ name }).trim()}
version: 0.1.0
env: development
debug: false

logging:
  level: info
  format: json
  # context:
  #   service: api
  redact:
    - password
    - token
    - secret

defaultLocale: ${locale}
# 短 ID 生成选项；语言列表在前端 project.inlang/settings.json 中维护。
# id:
#   prefix: app_
#   length: 21
`
}

function generateServConfig(): string {
  return `# =============================================================================
# Service / HTTP 入口配置
# =============================================================================

server:
  host: 127.0.0.1
  port: 3000

http:
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
    # requireAuth: true
  health:
    path: /health
    readyPath: /ready
  rpc: false
  # 启用内部 RPC 时用对象替换 false，gateway-only 必须配置网关密钥。
  # rpc:
  #   prefix: /api/rpc
  #   access: gateway-only # loopback | private-network | gateway-only
  #   gatewayHeader: X-Gateway-Key
  #   gatewaySecret: \${HAI_SERV_HTTP_RPC_GATEWAYSECRET}

# 按需开启跨域访问，生产环境填写明确的 Origin。
# cors:
#   origin: https://app.example.com
#   nativeOrigins: capacitor://localhost,tauri://localhost
#   allowedHeaders: [Authorization, Content-Type, X-Request-Id]
#   exposedHeaders: [X-Request-Id]
#   credentials: true

# 开发期默认关闭 transport；启用 @h-ai/crypto 后可按需改为对象配置
transport: false
# transport:
#   keyExchangePath: /_hai/key-exchange
#   excludePaths: [/health, /ready]
#   maxClients: 10000
`
}

function generateDbConfig(cfg?: DbModuleConfig): string {
  const dbType = cfg?.type ?? 'sqlite'
  const database = cfg?.database ?? (dbType === 'sqlite' ? './data/app.db' : 'hai')
  const host = cfg?.host ?? 'localhost'
  const port = cfg?.port ?? (dbType === 'postgresql' ? 5432 : 3306)

  const user = dbType === 'postgresql' ? 'postgres' : 'root'
  const connection = stringify({ host, port, user, password: '' }).trim()
  const networkOptions = `# url: \${HAI_DB_URL} # 可用连接串替代 host/port/user/password
# ssl: false # false | true | require | prefer | allow | disable，或 TLS 对象
# pool:
#   min: 1
#   max: 10
#   idleTimeout: 30000
#   acquireTimeout: 10000
# MySQL 专用；PostgreSQL 无需此块。
# mysql:
#   charset: utf8mb4
#   timezone: '+08:00'`

  return `# =============================================================================
# 数据库配置
# =============================================================================

# 数据库类型: sqlite | postgresql | mysql
type: ${dbType}

# SQLite 使用文件路径，PostgreSQL/MySQL 使用数据库名称。
${stringify({ database }).trim()}

${dbType === 'sqlite'
  ? `# SQLite 驱动选项；worker 将查询移到工作线程。
# sqlite:
#   walMode: true
#   readonly: false
#   executor: sync # sync | worker
#   workerConnectTimeoutMs: 10000

# 切换到 PostgreSQL/MySQL 时修改 type、database，并取消连接项的注释。
${stringify({ host: 'localhost', port: 5432, user: 'postgres', password: '' }).trim().split('\n').map(line => `# ${line}`).join('\n')}`
  : `# 网络数据库连接；凭据通过环境变量注入。
${connection}
# SQLite 替代方案：type: sqlite，database: ./data/app.db
# sqlite:
#   walMode: true
#   readonly: false
#   executor: sync
#   workerConnectTimeoutMs: 10000`}
${networkOptions}

# SQL 日志按需开启；maxLength 限制 SQL / 参数输出长度。
# operationLog:
#   read: false
#   write: false
#   maxLength: 1000
#   level: debug # trace | debug | info
`
}

function generateCacheConfig(cfg?: CacheModuleConfig): string {
  const cacheType = cfg?.type ?? 'memory'
  const host = cfg?.host ?? 'localhost'
  const port = cfg?.port ?? 6379
  const connection = stringify({ host, port, password: '', keyPrefix: 'hai:' }).trim()

  return `# =============================================================================
# 缓存配置
# =============================================================================

# 缓存类型: memory | redis
type: ${cacheType}

# Redis 配置；memory 时均不生效，切换 type 后取消需要的注释。
${cacheType === 'redis' ? connection : connection.split('\n').map(line => `# ${line}`).join('\n')}
# url: redis://localhost:6379/0
# db: 0
# connectTimeout: 10000
# commandTimeout: 5000
# tls: false
# maxRetries: 3
# retryDelay: 50
# readOnly: false
# 集群与 Sentinel 二选一；普通 Redis 不需要这两块。
# cluster:
#   - host: redis-1.internal
#     port: 6379
#   - host: redis-2.internal
#     port: 6379
# sentinel:
#   sentinels:
#     - host: sentinel.internal
#       port: 26379
#   name: mymaster
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
  apikey: false

# 注册与登录安全
register:
  enabled: true
  defaultEnabled: true
security:
  maxLoginAttempts: 5
  lockoutDuration: 900

# LDAP 可选：安装 ldapts 后开启 login.ldap；也可在 iam.init 中注入 ldapClientFactory。
# ldap:
#   url: ldaps://ldap.example.com:636
#   bindDn: cn=service,dc=example,dc=com
#   bindPassword: \${HAI_IAM_LDAP_BINDPASSWORD}
#   searchBase: ou=users,dc=example,dc=com
#   searchFilter: '(uid={{username}})'
#   usernameAttribute: uid
#   emailAttribute: mail
#   displayNameAttribute: cn
#   useTls: false # ldap:// 连接可开启 STARTTLS；ldaps:// 已使用 TLS
#   connectTimeout: 5000
# API Key 登录可选；密钥管理入口由应用按权限接入。
# apikey:
#   maxKeysPerUser: 10
#   defaultExpirationDays: 0 # 0 表示不限制有效期
#   prefix: hai_
# OTP 需启用 login.otp，并选择 Reach 标准模板或自定义发送回调。
${(loginOtp ? '' : '# 保留默认策略入口，单独切换 login.otp 即可启用验证码登录。\notp: {}\n# 定制策略时用下方配置块替换空对象，或通过 HAI_IAM_OTP 整体覆盖。\n') + `otp:
  email: true
  sms: true
  length: 6
  expiresIn: 300
  maxAttempts: 3
  resendInterval: 60`.split('\n').map(line => loginOtp ? line : `# ${line}`).join('\n')}
passwordReset:
  enabled: true
  mode: email # phone 使用 password_reset_sms 模板
  tokenExpiresIn: 3600
  maxAttempts: 3
  # resetUrl: https://example.com/auth/reset-password
agreements:
  showOnRegister: true
  showOnLogin: false
  # 用 | 配置 Markdown 正文；同主题同时提供 URL 时优先显示正文。
  userAgreementMarkdown: |
    # 用户协议示例

    请妥善保管账户凭据，并按应用提供的功能使用服务。
  privacyPolicyMarkdown: |
    # 隐私政策示例

    注册资料用于账户管理，会话信息用于身份认证。
  # userAgreementUrl: https://example.com/terms
  # privacyPolicyUrl: https://example.com/privacy
ui:
  variant: card
  # title: Account center
  # subtitle: Welcome back
  # brandTitle: Your application
  # brandText: Sign in securely
  # logoUrl: /logo.svg
  # illustrationUrl: /auth-illustration.svg

# 密码策略
password:
  minLength: 8
  maxLength: 128
  requireUppercase: false
  requireLowercase: false
  requireNumber: false
  requireSpecialChar: false
  expirationDays: 0 # 0 表示不限制密码有效期

# 会话配置
session:
  maxAge: 86400 # 会话超时（秒），默认 24 小时
  sliding: true # 滑动窗口（每次请求刷新过期时间）
  singleDevice: false # 单设备登录
  refreshTokenMaxAge: 604800 # refreshToken 过期（秒），默认 7 天

# RBAC 配置
rbac:
  enabled: true
  superAdminRole: super_admin
  defaultRole: user

# 是否自动创建默认数据
seedDefaultData: true
`
}

function generateStorageConfig(cfg?: StorageModuleConfig): string {
  const type = cfg?.type ?? 'local'
  const local = `${stringify({ root: cfg?.localPath ?? './data/uploads' }).trim()}
# directoryMode: 493 # 0o755
# fileMode: 420 # 0o644`
  const s3 = `bucket: ''
region: us-east-1
accessKeyId: ''
secretAccessKey: ''
# endpoint: https://s3.amazonaws.com
# forcePathStyle: false
# prefix: ''
# publicUrl: https://cdn.example.com`
  return `# 存储配置；HAI_STORAGE 可整体替换连接配置。
type: ${type}
${type === 'local' ? local : s3}

# 切换 type 后使用另一种存储的连接项。
${(type === 'local' ? s3 : local).split('\n').map(line => line.startsWith('#') ? line : `# ${line}`).join('\n')}

# operationLog:
#   read: false
#   write: false
#   maxLength: 1000
#   level: debug # trace | debug | info
`
}

function generateAiConfig(cfg?: AiModuleConfig): string {
  const model = cfg?.model ?? 'gpt-4o-mini'
  const api = cfg?.defaultProvider === 'anthropic' ? 'anthropic' : 'chat'
  return `# =============================================================================
# AI 配置
# =============================================================================

# LLM 配置（必填）
llm:
  # API Key（约定环境变量 HAI_AI_LLM_APIKEY 优先）
  apiKey: ''
  # Base URL（约定环境变量 HAI_AI_LLM_BASEURL 优先）
  # baseUrl: https://api.openai.com/v1
  # 默认模型
${stringify({ model }).trim().split('\n').map(line => `  ${line}`).join('\n')}
  api: ${api} # chat | responses | anthropic
  # 全局最大 Token 数（默认 4096）
  # maxTokens: 4096
  # 采样温度（0-2，默认 0.7）
  # temperature: 0.7
  # 请求超时（毫秒，默认 60000）
  # timeout: 60000
  # tempModelCacheTtl: 600000

  # 多模型配置（可选，用于场景路由）
  # models:
  #   - id: fast
  #     model: gpt-4o-mini
  #     api: chat
  #     apiKey: ''
  #     baseUrl: https://api.openai.com/v1
  #     maxTokens: 4096
  #     temperature: 0.7
  #     timeout: 60000
  #   - id: smart
  #     model: gpt-4o
  #     apiKey: ''

  # 场景模型映射（可选）
  # scenarios:
  #   default: fast
  #   chat: fast
  #   reasoning: smart
  #   plan: smart
  #   execute: fast
  #   extraction: fast
  #   summary: fast
  #   embedding: embedding
  #   rerank: rerank
  #   ocr: vision
  #   fast: fast
  # embedding / rerank / vision 须在 models 中声明对应厂商模型，不能只填写场景 ID。

# 可选子模块：只取消需要的块的注释，模型、向量库与数据库依赖按使用场景初始化。
# mcp:
#   server:
#     name: my-app
#     version: 1.0.0
#     capabilities:
#       tools: true
#       resources: true
#       prompts: true
# embedding:
#   dimensions: 1536
#   batchSize: 100
# knowledge:
#   collection: hai_ai_knowledge
#   dimension: 1536
#   enableEntityExtraction: true
#   entityBoostWeight: 0.15
#   entityTypes: [person, organization, location]
#   systemPrompt: 'Extract entities from the input.'
#   cleanOptions:
#     removeHtml: true
#     removeUrls: false
#     removeEmails: false
#     normalizeWhitespace: true
#     trim: true
#     customReplacements:
#       - pattern: '\\t+'
#         replacement: ' '
#   chunkOptions:
#     mode: markdown # sentence | paragraph | markdown | page | word | character | custom
#     maxSize: 1500
#     overlap: 200
#     separator: '\\n\\n' # 仅 custom 模式使用
#     markdownMinLevel: 2
#     markdownKeepTitle: true
# memory:
#   provider: native # native | mem0
#   allowEphemeralFallback: false
#   maxEntriesPerObject: 1000
#   maxEntriesGlobal: 100000
#   systemPrompt: 'Extract useful memories from the conversation.'
#   recencyDecay: 0.95
#   embeddingEnabled: true
#   defaultTopK: 10
#   candidateMultiplier: 5
#   writebackRelatedTopK: 20
# token:
#   tokenRatio: 0.25
# summary:
#   systemPrompt: 'Summarize the conversation.'
# compress:
#   defaultStrategy: hybrid # summary | sliding-window | hybrid
#   defaultMaxTokens: 0
#   preserveLastN: 4
# retrieval:
#   sources:
#     - id: docs
#       collection: documentation
#       name: Product documentation
#       url: https://docs.example.com
#       topK: 5
#       minScore: 0.7
#       filter:
#         published: true
# file:
#   systemPrompt: 'Extract text from the image.'
# a2a:
#   agentCard:
#     name: my-agent
#     description: Application agent
#     url: https://agent.example.com
#     version: 1.0.0
#     skills:
#       - id: chat
#         name: Chat
#         description: General conversation
#         tags: [chat]
#   security:
#     apiKey:
#       in: header # header | query
#       name: x-api-key
# audio:
#   inheritLlmApiKey: false
#   transcribeModel: asr
#   synthesizeModel: tts
#   maxAudioBytes: 10485760
#   maxStreamDurationMs: 300000
#   models:
#     - id: asr
#       provider: openai # openai | mimo | qwen | doubao | whisper | indextts
#       model: whisper-1
#       operations: [transcribe]
#       apiKey: ''
#       baseUrl: https://api.openai.com/v1
#       timeout: 60000
#       appKey: '' # 豆包旧版控制台 ASR 使用
#       accessKey: ''
#       resourceId: ''
#       workspaceId: '' # 百炼业务空间
#     - id: tts
#       provider: openai
#       model: tts-1
#       operations: [synthesize]
# image:
#   generateModel: image
#   models:
#     - id: image
#       provider: openai # openai | google | qwen | seedream | pollinations
#       model: gpt-image-1
#       apiKey: ''
#       baseUrl: https://api.openai.com/v1
#       workspaceId: ''
#       timeout: 120000
`
}

/**
 * 根据选中的功能模块生成 .env.example 内容
 *
 * @param features - 选中的功能模块列表
 * @param configs - 用户自定义配置值
 * @param includeDisabled - 是否输出所有模块的完整注释示例（fullstack 使用，默认值以 YAML 为准）
 * @returns .env.example 文件内容
 */
export function generateEnvExample(features: FeatureId[], configs?: ModuleConfigs, includeDisabled = false): string {
  const sections: string[] = []

  // 文件头
  sections.push(`# =============================================================================
# Environment Variables
# =============================================================================
#
# Copy this file to .env and fill in actual values.
# Config files use literal defaults; matching HAI variables override YAML leaves.
# Uncomment the matching YAML keys before using leaf overrides; HAI_<module> replaces the whole object.
#
# Naming convention: HAI_<config name>_<YAML path>
# =============================================================================`)

  // 应用基础（始终生成）
  sections.push(`
# =============================================================================
# Application
# =============================================================================
# Environment: development | production | test
HAI_CORE_ENV=development
# Enable debug mode
HAI_CORE_DEBUG=false`)

  // 数据库
  if (features.includes('db') || includeDisabled) {
    const dbType = configs?.db?.type ?? 'sqlite'
    const dbDatabase = configs?.db?.database ?? (dbType === 'sqlite' ? './data/app.db' : 'hai')
    const isSqlite = dbType === 'sqlite'
    sections.push(`
# =============================================================================
# Database (@h-ai/reldb)
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
  if (features.includes('iam') || includeDisabled) {
    sections.push(`
# =============================================================================
# IAM (@h-ai/iam)
# =============================================================================
# HAI_IAM_PASSWORD_MINLENGTH=8
# HAI_IAM_SESSION_MAXAGE=86400
# HAI_IAM_SESSION_REFRESHTOKENMAXAGE=604800
# HAI_IAM_OTP={"email":true,"sms":true,"length":6,"expiresIn":300,"maxAttempts":3,"resendInterval":60}
# HAI_IAM_LDAP_BINDPASSWORD=          # Enable login.ldap and uncomment the ldap block first.
# HAI_IAM_PASSWORDRESET_RESETURL=https://app.example.com/auth/reset-password
# HAI_KIT_COOKIE_KEY=                 # 32-char hex for SM4-CBC cookie encryption
`)
  }

  // 缓存
  if (features.includes('cache') || includeDisabled) {
    const cacheType = configs?.cache?.type ?? 'memory'
    if (cacheType === 'redis') {
      sections.push(`
# =============================================================================
# Cache (@h-ai/cache)
# =============================================================================
# Cache type: memory | redis
HAI_CACHE_TYPE=redis
# Redis connection
HAI_CACHE_HOST=${configs?.cache?.host ?? 'localhost'}
HAI_CACHE_PORT=${configs?.cache?.port ?? 6379}
HAI_CACHE_PASSWORD=
# HAI_CACHE_URL=redis://localhost:6379/0
# HAI_CACHE_DB=0
# HAI_CACHE_CONNECTTIMEOUT=10000
# HAI_CACHE_COMMANDTIMEOUT=5000
# HAI_CACHE_KEYPREFIX=hai:`)
    }
    else {
      sections.push(`
# =============================================================================
# Cache (@h-ai/cache)
# =============================================================================
# Cache type: memory | redis
HAI_CACHE_TYPE=memory
# Redis connection (uncomment when type=redis)
# HAI_CACHE_URL=redis://localhost:6379/0
# HAI_CACHE_HOST=localhost
# HAI_CACHE_PORT=6379
# HAI_CACHE_PASSWORD=
# HAI_CACHE_DB=0
# HAI_CACHE_CONNECTTIMEOUT=10000
# HAI_CACHE_COMMANDTIMEOUT=5000
# HAI_CACHE_KEYPREFIX=hai:`)
    }
  }

  // 存储
  if (features.includes('storage') || includeDisabled) {
    const storageType = configs?.storage?.type ?? 'local'
    if (storageType === 's3') {
      sections.push(`
# =============================================================================
# Storage (@h-ai/storage)
# =============================================================================
# Default storage provider: local | s3
HAI_STORAGE_TYPE=s3
# S3 / S3-compatible
HAI_STORAGE_BUCKET=
HAI_STORAGE_REGION=us-east-1
HAI_STORAGE_ACCESSKEYID=
HAI_STORAGE_SECRETACCESSKEY=
# HAI_STORAGE_ENDPOINT=          # Custom endpoint for MinIO / Aliyun OSS etc.
# HAI_STORAGE_FORCEPATHSTYLE=false
# Local storage (uncomment when type=local)
# HAI_STORAGE_ROOT=./data/uploads`)
    }
    else {
      sections.push(`
# =============================================================================
# Storage (@h-ai/storage)
# =============================================================================
# Default storage provider: local | s3
HAI_STORAGE_TYPE=local
# Local storage root path
HAI_STORAGE_ROOT=${configs?.storage?.localPath ?? './data/uploads'}
# S3 / S3-compatible (uncomment when type=s3)
# HAI_STORAGE_BUCKET=
# HAI_STORAGE_REGION=us-east-1
# HAI_STORAGE_ACCESSKEYID=
# HAI_STORAGE_SECRETACCESSKEY=
# HAI_STORAGE_ENDPOINT=          # Custom endpoint for MinIO / Aliyun OSS etc.
# HAI_STORAGE_FORCEPATHSTYLE=false`)
    }
  }

  // AI
  if (features.includes('ai') || includeDisabled) {
    sections.push(`
# =============================================================================
# AI (@h-ai/ai)
# =============================================================================
# Select chat / responses / anthropic in _ai.yml (llm.api).
HAI_AI_LLM_APIKEY=
# HAI_AI_LLM_BASEURL=               # Custom base URL
# Optional compatibility fallback
# OPENAI_API_KEY=`)
  }

  // VecDB
  if (features.includes('vecdb') || includeDisabled) {
    sections.push(`
# =============================================================================
# Vector Database (@h-ai/vecdb)
# =============================================================================
# Backend type: lancedb | pgvector | qdrant | chroma
HAI_VECDB_TYPE=lancedb
# LanceDB data path
HAI_VECDB_PATH=./data/vecdb
# Qdrant (uncomment when type=qdrant)
# HAI_VECDB_URL=http://localhost:6333
# HAI_VECDB_APIKEY=
`)
  }

  // Reach
  if (features.includes('reach') || includeDisabled) {
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
# HAI_REACH_SMS_ACCESS_KEY=
# HAI_REACH_SMS_SECRET_KEY=
# HAI_REACH_API_TOKEN=
# HAI_REACH_PROVIDERS=                # JSON array replacing all providers, while retaining templates.
`)
  }

  // Payment
  if (features.includes('payment') || includeDisabled) {
    sections.push(`
# =============================================================================
# Payment (@h-ai/payment)
# =============================================================================
# WeChat Pay
# HAI_PAYMENT_WECHAT_MCHID=
# HAI_PAYMENT_WECHAT_APIV3KEY=
# HAI_PAYMENT_WECHAT_SERIALNO=
# HAI_PAYMENT_WECHAT_PRIVATEKEY=
# HAI_PAYMENT_WECHAT_PLATFORMCERT=
# HAI_PAYMENT_WECHAT_APPID=
# Alipay
# HAI_PAYMENT_ALIPAY_APPID=
# HAI_PAYMENT_ALIPAY_PRIVATEKEY=
# HAI_PAYMENT_ALIPAY_ALIPAYPUBLICKEY=
# Stripe
# HAI_PAYMENT_STRIPE_SECRETKEY=
# HAI_PAYMENT_STRIPE_WEBHOOKSECRET=
`)
  }

  if (features.includes('deploy') || includeDisabled) {
    sections.push(`
# =============================================================================
# Deployment (@h-ai/deploy)
# =============================================================================
# HAI_DEPLOY_VERCEL_TOKEN=
# HAI_DEPLOY_SSH_HOST=
# HAI_DEPLOY_SSH_KEY=
# HAI_DEPLOY_SSH_KNOWNHOSTSFILE=
# HAI_DEPLOY_NEON_API_KEY=
# HAI_DEPLOY_UPSTASH_EMAIL=
# HAI_DEPLOY_UPSTASH_API_KEY=
# HAI_DEPLOY_CF_ACCOUNT_ID=
# HAI_DEPLOY_CF_API_TOKEN=
# HAI_DEPLOY_R2_ACCESS_KEY_ID=
# HAI_DEPLOY_R2_SECRET_ACCESS_KEY=
# HAI_DEPLOY_RESEND_API_KEY=
# HAI_DEPLOY_RESEND_FROM=
# HAI_DEPLOY_ALIYUN_ACCESS_KEY_ID=
# HAI_DEPLOY_ALIYUN_ACCESS_KEY_SECRET=
# HAI_DEPLOY_ALIYUN_SIGN_NAME=
`)
  }

  if (includeDisabled) {
    sections.push(`
# =============================================================================
# Service (@h-ai/serv)
# =============================================================================
# HOST=127.0.0.1                     # HOST/PORT override _serv.yml server settings.
# PORT=3000
# HAI_CORS_ORIGIN=http://127.0.0.1:4173,http://localhost:4173
# HAI_CORS_NATIVEORIGINS=http://localhost,https://localhost,http://tauri.localhost,https://tauri.localhost,tauri://localhost,capacitor://localhost
# HAI_CORS_CREDENTIALS=true
# HAI_SERV_HTTP_RPC_GATEWAYSECRET=   # Enable the gateway-only RPC block before setting this.
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

  const content = sections.join('\n')
  // fullstack 自动生成 .env；默认覆盖也必须注释，否则后续编辑 YAML 会被旧值悄悄覆盖。
  return includeDisabled
    ? content.split('\n').map(line => line && !line.startsWith('#') ? `# ${line}` : line).join('\n')
    : content
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

# ---------------------------------------------------------------------------
# 方式二：docker-ssh — 将应用容器化后通过 SSH 部署到任意 Linux 主机
# 远程主机只需具备 SSH + docker/podman + compose，本地需 docker 或 podman
# 切换时用下方 provider 替换上面的 vercel provider
# ---------------------------------------------------------------------------
# provider:
#   type: docker-ssh
#   ssh:
#     host: \${HAI_DEPLOY_SSH_HOST}
#     port: 22
#     username: deploy
#     identityFile: \${HAI_DEPLOY_SSH_KEY}   # 私钥文件路径（省略则用 ssh-agent）
#     knownHostsFile: \${HAI_DEPLOY_SSH_KNOWNHOSTSFILE}
#     strictHostKeyChecking: true
#     connectTimeoutSeconds: 10
#   remote:
#     baseDir: /opt/hai/apps
#     runtime: auto                          # auto 优先 podman，其次 docker
#   expose:
#     type: port
#     containerPort: 3000
#     hostPort: 18080                        # 访问地址 http://<host>:18080

# 本地构建运行时（docker-ssh 使用；auto 优先 podman）
# container:
#   runtime: auto

# 基础设施服务（按需开启）
# services:
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
  #   accessKeyId: \${HAI_DEPLOY_R2_ACCESS_KEY_ID}
  #   secretAccessKey: \${HAI_DEPLOY_R2_SECRET_ACCESS_KEY}

  # 邮件 (Resend)
  # email:
  #   provisioner: resend
  #   apiKey: \${HAI_DEPLOY_RESEND_API_KEY}
  #   from: \${HAI_DEPLOY_RESEND_FROM}

  # 短信 (阿里云)
  # sms:
  #   provisioner: aliyun
  #   accessKeyId: \${HAI_DEPLOY_ALIYUN_ACCESS_KEY_ID}
  #   accessKeySecret: \${HAI_DEPLOY_ALIYUN_ACCESS_KEY_SECRET}
  #   signName: \${HAI_DEPLOY_ALIYUN_SIGN_NAME}

# docker-ssh 说明：
# - 应用镜像使用工程自带的 Dockerfile（adapter-node），本地构建后经 SSH 传输并 load
# - compose 会按上方启用的 db/cache/storage 自动追加 postgres/redis/minio sidecar
# - 若同时配置了对应云 Provisioner，则优先使用云资源，不再自建 sidecar
`
}

function generateVecdbConfig(): string {
  return `# =============================================================================
# 向量数据库配置 (@h-ai/vecdb)
# =============================================================================

# 数据库类型: lancedb | pgvector | qdrant | chroma
type: lancedb

# LanceDB 数据目录
path: ./data/vecdb

# 距离度量: cosine | euclidean | dot
# metric: cosine

# pgvector 配置（当 type 为 pgvector 时使用）
# type: pgvector
# url: \${HAI_VECDB_URL}
# host: localhost
# port: 5432
# database: hai
# user: postgres
# password: ''
# indexType: hnsw
# tablePrefix: vec_

# Qdrant 配置（当 type 为 qdrant 时使用）
# type: qdrant
# url: http://localhost:6333
# apiKey: ''

# Chroma 配置（替换 type；url 指向已有服务，path 用于本地子进程数据目录）
# type: chroma
# path: ./data/chroma
# url: http://localhost:8000
# host: localhost
# port: 8000
# apiKey: ''
# serverCommand: chroma
# startupTimeout: 30000

# operationLog:
#   read: false
#   write: false
#   maxLength: 1000
#   level: debug # trace | debug | info
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
  #   endpoint: dysmsapi.aliyuncs.com

  # 通用 API（按需开启；可对接应用自有投递服务）
  # - name: custom
  #   type: api
  #   url: https://notify.example.com/send
  #   method: POST # POST | PUT
  #   headers:
  #     Authorization: 'Bearer \${HAI_REACH_API_TOKEN}'
  #   timeout: 10000

# IAM 标准模板：保留空数组以支持 HAI_REACH_TEMPLATES 整体覆盖。
templates: []
# 开启对应 Provider 后，将空数组替换为需要的模板列表，例如：
# templates:
#   - name: otp_email
#     provider: email
#     subject: "Verification code"
#     body: "Your verification code is {code}."
#   - name: otp_sms
#     provider: sms
#     body: "Your verification code is {code}."
#   - name: password_reset
#     provider: email
#     subject: "Password reset"
#     body: "Reset your password: {resetUrl}. Expires at {expiresAt}."
#   - name: password_reset_sms
#     provider: sms
#     body: "Reset your password: {resetUrl}. Expires at {expiresAt}."

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

# 检查间隔（毫秒）
tickInterval: 1000

# 锁过期时间（毫秒）
lockExpireMs: 300000

# 节点 ID 默认自动生成；多节点部署时每个实例应使用独立 ID。
# nodeId: worker-1
# 执行日志保留策略（启用数据库时使用）
# maxLogs: 10000
# retentionDays: 30
`
}

function generateAuditConfig(): string {
  return `# =============================================================================
# 审计日志配置 (@h-ai/audit)
# =============================================================================

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
#   mchId: ''
#   apiV3Key: ''
#   serialNo: ''
#   privateKey: ''
#   platformCert: ''
#   appId: ''

# 支付宝（按需开启）
# alipay:
#   appId: ''
#   privateKey: ''
#   alipayPublicKey: ''
#   signType: RSA2
#   sandbox: false

# Stripe（按需开启）
# stripe:
#   secretKey: ''
#   webhookSecret: ''
#   webhookToleranceSeconds: 300
`
}
