/**
 * @h-ai/cli — 配置文件模板
 *
 * 为各模块生成默认配置及按需取消注释的选项；配置字段以模块 Schema 为准。
 * @module cli-config-templates
 */

import type { AiModuleConfig, CacheModuleConfig, CoreModuleConfig, DbModuleConfig, FeatureId, IamModuleConfig, ModuleConfigs, StorageModuleConfig } from '../cli-types.js'
import { stringify } from 'yaml'
import { configEnvironmentVariables, moduleEnvironmentVariables, parameterizeConfig, renderEnvironment } from './cli-config-environment.js'

/**
 * 生成模块配置文件内容
 *
 * @param moduleKey - 拥有配置 Schema 的模块标识
 * @param configs - 用户自定义配置值
 * @returns YAML 格式的配置内容
 */
export function generateConfigFile(moduleKey: string, configs?: ModuleConfigs): string {
  return parameterizeConfig(moduleKey, generateLiteralConfigFile(moduleKey, configs))
}

function generateLiteralConfigFile(moduleKey: string, configs?: ModuleConfigs): string {
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
  const port = cfg?.port ?? (dbType === 'mysql' ? 3306 : 5432)

  const user = dbType === 'mysql' ? 'root' : 'postgres'
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

${connection}
url: \${HAI_DB_URL:}
ssl: \${HAI_DB_SSL:false}
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

# Redis 配置；memory 时不生效；跨环境切换 type 后自动使用连接项。
${connection}
url: ''
db: 0
connectTimeout: 10000
commandTimeout: 5000
tls: false
maxRetries: 3
retryDelay: 50
readOnly: false
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
${local}
${s3}

# type 选择 Provider；未选分支字段由模块 Schema 忽略。
# endpoint / publicUrl 为可选 URL，启用时取消对应字段注释并通过环境变量提供。

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
 * @param includeDisabled - 是否输出所有模块的完整注释示例（fullstack 使用，未启用模块保留注释）
 * @returns .env.example 文件内容
 */
export function generateEnvExample(features: FeatureId[], configs?: ModuleConfigs, includeDisabled = false, configContents: Record<string, string> = {}): string {
  const keys = new Set(['core', ...(configContents.serv ? ['serv'] : []), ...features.filter(feature => !['crypto', 'api-client', 'capacitor', 'datapipe'].includes(feature))])
  const allKeys = ['core', 'serv', 'db', 'cache', 'iam', 'storage', 'ai', 'vecdb', 'reach', 'payment', 'scheduler', 'deploy', 'audit']
  const sections = [`# Environment configuration
# .env / .env.dev / .env.test / .env.prod are public configuration tracked in Git.
# .env.local is private to this machine and ignored by Git.
# Priority: process environment > .env.local > .env.<dev|test|prod> > .env.
# Naming: HAI_<CONFIG>_<PATH>; camelCase stays joined (apiKey -> APIKEY); arrays use zero-based indexes.
# PUBLIC_ / VITE_ variables are visible in browsers and must never contain secrets.
# YAML declares references and local fallbacks; constraints are validated by module Schemas.
# Values in this example are safe defaults. Keep real credentials in ignored .env.local or secret management.
`]
  for (const key of allKeys) {
    if (!keys.has(key) && !includeDisabled)
      continue
    const variables = configEnvironmentVariables(key, configContents[key] ?? generateConfigFile(key, configs))
    const section = renderEnvironment(variables)
    const activeNames = new Set(variables.map(variable => variable.name))
    const optional = renderEnvironment(moduleEnvironmentVariables(key).filter(variable => !activeNames.has(variable.name)))
    const commented = (value: string) => value.split('\n').map(line => line && !line.startsWith('#') ? `# ${line}` : line).join('\n')
    sections.push(`# --- ${key} ---\n${keys.has(key) ? section : commented(section)}\n\n# 可选字段：先启用 YAML 路径，或用父级对象整体覆盖。\n${commented(optional)}`)
  }
  return `${sections.join('\n\n')}\n`
}

function generateDeployConfig(): string {
  return `# 部署已有镜像；运行 pnpm run deploy --build 可先构建再发布。
# SSH 参数由向导保存在本机 .env.local；离线打包不要求 SSH。
provider:
  type: docker-ssh
  remote:
    baseDir: /opt/hai/apps
    runtime: auto # 优先 Podman，其次 Docker
  expose:
    hostPort: 18080
    containerPort: 3000

container:
  s3Engine: \${HAI_DEPLOY_CONTAINER_S3ENGINE:rustfs} # rustfs | minio

# 完整包包含自建中间件镜像，服务器启动禁止拉取。
# 外部数据库/存储等连接在对应模块配置和环境文件中设置。
# Vercel 仅消费已有 .vercel/output，云 Provider/Provisioner 不适用于完全离线。
# provider:
#   type: vercel
#   token: \${HAI_DEPLOY_PROVIDER_TOKEN}
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
  #   host: \${HAI_REACH_PROVIDERS_0_HOST:smtp.example.com}
  #   port: \${HAI_REACH_PROVIDERS_0_PORT:465}
  #   secure: true
  #   user: \${HAI_REACH_PROVIDERS_0_USER:}
  #   pass: \${HAI_REACH_PROVIDERS_0_PASS:}
  #   from: \${HAI_REACH_PROVIDERS_0_FROM:noreply@example.com}

  # 阿里云短信（按需开启）
  # - name: sms
  #   type: aliyun-sms
  #   accessKeyId: \${HAI_REACH_PROVIDERS_0_ACCESSKEYID}
  #   accessKeySecret: \${HAI_REACH_PROVIDERS_0_ACCESSKEYSECRET}
  #   signName: MyApp
  #   endpoint: dysmsapi.aliyuncs.com

  # 通用 API（按需开启；可对接应用自有投递服务）
  # - name: custom
  #   type: api
  #   url: https://notify.example.com/send
  #   method: POST # POST | PUT
  #   headers:
  #     Authorization: 'Bearer \${HAI_REACH_PROVIDERS_0_HEADERS_AUTHORIZATION}'
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

# Stripe（按需开启；先初始化共享 reldb，持久化渠道映射和幂等结果）
# stripe:
#   secretKey: ''
#   webhookSecret: ''
#   webhookToleranceSeconds: 300
`
}
