/**
 * @h-ai/cli — 配置文件模板
 *
 * 为各模块生成默认配置及按需取消注释的选项；配置字段以模块 Schema 为准。
 * @module cli-config-templates
 */

import type { AiModuleConfig, CacheModuleConfig, CoreModuleConfig, DbModuleConfig, FeatureId, IamModuleConfig, ModuleConfigs, StorageModuleConfig } from '../cli-types.js'
import { stringify } from 'yaml'
import { configEnvironmentVariables, documentConfig, moduleEnvironmentVariables, parameterizeConfig, renderEnvironment } from './cli-config-environment.js'

/**
 * 生成模块配置文件内容
 *
 * @param moduleKey - 拥有配置 Schema 的模块标识
 * @param configs - 用户自定义配置值
 * @returns YAML 格式的配置内容
 * @example 模块内部上下文
 * ```ts
 * const yaml = generateConfigFile('db', { db: { type: 'postgresql', host: 'db', database: 'shop' } })
 * // 输出显式 HAI_DB_* 引用；连接密码仍由私有环境注入。
 * ```
 */
export function generateConfigFile(moduleKey: string, configs?: ModuleConfigs): string {
  return documentConfig(moduleKey, parameterizeConfig(moduleKey, generateLiteralConfigFile(moduleKey, configs)))
}

function generateLiteralConfigFile(moduleKey: string, configs?: ModuleConfigs): string {
  switch (moduleKey) {
    case 'core':
      return generateCoreConfig(configs?.core)
    case 'serv':
      return generateServConfig()
    case 'kit':
      return generateKitConfig()
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
    case 'feedback':
      return generateFeedbackConfig()
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

logging:
  level: info
  format: pretty
  # context:
  #   service: api
  # redact 填日志字段路径；customer.email 遮盖客户邮箱，recipients[*].phone 遮盖数组中的电话。
  # 只匹配指定层级，* 匹配一层；密码和令牌等已知凭据默认仍会脱敏。
  redact:
    - password
    - token
    - secret

defaultLocale: ${locale}
`
}

function generateKitConfig(): string {
  return `# SvelteKit 服务端入口；私有访问策略不传给浏览器。
server:
  host: 127.0.0.1
  port: 3000
# auto 仅在受管私有 Compose 代理中采用容器网段；普通宿主忽略转发头。
# 自建代理填写明确的 IP/CIDR；[] 显式忽略转发头。
trustedProxies: auto
access: false
# access:
#   file: ./config/security/request-access.yml
transport: false
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
  trustedProxies: auto
  access: false
  # access:
  #   file: ./config/security/request-access.yml
  # 或将 access: false 替换为下列内联配置；与 file 二选一。
  # access:
  #   global:
  #     timezone: UTC # 可用 HAI_SERV_HTTP_ACCESS_GLOBAL_TIMEZONE=Asia/Shanghai
  #     allowIps: []
  #     denyIps: []
  #     windows: []
  #   rules: []
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  # HAI_SERV_HTTP_DOCS=false 关闭文档；开启时再配置 path/requireAuth。
  docs:
    path: /docs
    # requireAuth: true
  health:
    path: /health
    readyPath: /ready

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
#   maxPlaintextBytes: \${HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES:1048576} # 双向 UTF-8 明文，1 KiB～64 MiB
#   keyExchangePath: /_hai/key-exchange
#   excludePaths: [/health, /ready]
# 单条路径需要更大请求体时填写字节数，* 只匹配一段路径。
#   routePlaintextBytes: # HAI_SERV_TRANSPORT_ROUTEPLAINTEXTBYTES 可填 JSON 路径映射
#     /api/v1/uploads/*: 8388608
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
# PostgreSQL ssl：布尔值、require/prefer/allow/disable 或 TLS 对象。
# MySQL ssl：false 或严格对象；{} 默认校验证书链和 DNS 身份，不能用 true 或 PostgreSQL 字符串模式。
# MySQL 自定义 CA / mTLS 使用 ca/cert/key 的 PEM 内容；cert/key 必须成对，私钥仅注入私有环境。
# pool:
#   min: 1
#   max: 10
#   idleTimeout: 30000
#   acquireTimeout: 10000
# MySQL 专用；PostgreSQL 无需此块。
# mysql:
#   charset: utf8mb4
# MySQL 不支持 timezone 配置；不要在 mysql 块内填写该字段。`

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

# 操作日志按需开启，只记录耗时、数量等安全摘要；maxLength 限制摘要长度，不记录 SQL 原文和参数。
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
  defaultAccountStatus: active
security:
  lockoutEnabled: false # 按需开启；关闭后历史锁不阻止登录/旧密码验证
  failureWindow: 86400 # 从首次失败起计数的固定窗口（秒）
  maxLoginAttempts: 5
  lockoutDuration: 1200

# 自托管轻量挑战；关闭时不加载浏览器求解器。强度影响客户端计算时间。
captcha:
  enabled: false
  ttlSeconds: 120
  cost: 5000
  maxCounter: 100

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
#   prefix: hai_ # 新建 API Key 的开头，例如 hai_abc123；只填应用标识，不放密码。
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
  minCharacterClasses: 0 # 大写、小写、数字、特殊字符中至少满足的类别数；0 关闭
  expirationDays: 0 # 0 表示不限制密码有效期
  preventSamePassword: false # 启用后新旧密码必须不同；有效期策略也强制不同
  requireInitialChange: false # 管理员创建/重置后首次登录先改密

initialCredentials:
  enabled: false # 单次邀请；需密码重置和通知通道

reauthentication:
  enabled: false
  ttlSeconds: 300
  operations: [] # 例如 iam.users.delete、iam.roles.update

loginAccess:
  enabled: false
  timezone: UTC
  allowIps: [] # 空列表不限制；支持 IPv4、IPv6 与 CIDR
  denyIps: [] # 拒绝优先
  windows: [] # 留空允许任何时间；以下例子只允许周一至周五 09:00–18:00 登录。
  # windows:
  #   - days: [1, 2, 3, 4, 5]
  #     start: '09:00'
  #     end: '18:00'
  # timezone 设为 Asia/Shanghai 时，上述时间按北京时间解释。

# 会话配置
session:
  endOnPageHide: false # 页面关闭/整页导航时尽力撤销；配合服务端超时
  maxAge: 86400 # 会话超时（秒），默认 24 小时
  sliding: true # 滑动窗口（每次请求刷新过期时间）
  singleDevice: false # 单设备登录
  singleDeviceMode: replace # replace 顶旧保新；reject 拒绝重复登录
  maxSessions: 0 # 每用户有效会话上限，0 不限制
  # 按终端分别限制；非空时仅允许列出的类型，仍受全局最大会话数约束。
  terminalLimits: {} # 留空不按终端限制。下面例子允许 web 2 个、app 1 个，其余终端不允许新登录。
  # terminalLimits:
  #   web: 2
  #   app: 1
  # 前端发送的终端名称必须与键名相同；此限制同时受 maxSessions 约束。
  terminalLimitMode: reject
  idleTimeout: 0 # 闲置期限（秒），0 关闭；access/refresh 均执行
  absoluteTimeout: 0 # 从首次登录起的绝对期限（秒），0 关闭
  refreshTokenMaxAge: 604800 # refreshToken 过期（秒），默认 7 天

# 自动休眠策略
accounts:
  dormantAfterDays: 0 # 连续未成功登录天数，0 关闭
  scanIntervalSeconds: 3600 # 开启时的扫描间隔（秒）

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
# 显式开启后，storage.init 检查并创建缺失桶；外部存储默认不开启。
createBucket: false
region: us-east-1
accessKeyId: ''
secretAccessKey: ''
endpoint: \${HAI_STORAGE_ENDPOINT:https://s3.amazonaws.com}
forcePathStyle: false
# prefix: '' # 对象路径前缀，例如 invoices/2026；保存 report.pdf 后键名为 invoices/2026/report.pdf。
# publicEndpoint: https://app.example.com # 浏览器下载入口，可带 /files 等代理目录；不含桶名
# publicUrl: https://cdn.example.com`
  return `# 存储配置；HAI_STORAGE 可整体替换连接配置。
type: ${type}
${local}
${s3}

# type 选择 Provider；未选分支字段由模块 Schema 忽略。
# S3 兼容服务由环境注入 endpoint / forcePathStyle；默认端点用于 us-east-1。

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

# 对话模型（使用对话功能时配置）
llm:
  # API Key（约定环境变量 HAI_AI_LLM_APIKEY 优先）
  apiKey: ''
  # Base URL（约定环境变量 HAI_AI_LLM_BASEURL 优先）
  # baseUrl: https://api.openai.com/v1
  # 默认模型
${stringify({ model }).trim().split('\n').map(line => `  ${line}`).join('\n')}
  protocol: ${api} # 请求格式：OpenAI 兼容选 chat，Responses 选 responses，Claude Messages 选 anthropic。
  # 全局最大 Token 数（默认 4096）
  # maxTokens: 4096
  # 采样温度（0-2，默认 0.7）
  # temperature: 0.7
  # 请求超时（毫秒，默认 60000）
  # timeout: 60000
  # tempModelCacheTtl: 600000

  # 多模型配置：id 是应用中的短名，model 是供应商的真实型号。各项可单独设置协议、地址和密钥。
  # models:
  #   - id: fast
  #     model: gpt-4o-mini
  #     protocol: chat
  #     apiKey: ''
  #     baseUrl: https://api.openai.com/v1
  #     maxTokens: 4096
  #     temperature: 0.7
  #     timeout: 60000
  #   - id: smart
  #     model: gpt-4o
  #     apiKey: ''

  # 场景模型映射：普通对话用 fast，复杂推理用 smart；值对应上方 models 的 id。
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

# 可选子模块只取消需要的块；生产环境先初始化共享数据库与网络向量库，再初始化 AI。
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
#   execution:
#     leaseMs: 30000
#     pollIntervalMs: 250
#     maxExecutionMs: 300000
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
#   maxImageBytes: 20971520 # 单张图片/参考图字节上限；JSON 上限为 max(64KiB, 两倍该值)
#   maxImages: 4 # 图片/参考图数量上限，临时 URL 串行下载
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
 * @param configContents - 按配置名索引的已渲染 YAML，使示例与真实引用一致；省略项使用默认模板。
 * @returns .env.example 文件内容
 * @example 模块内部上下文
 * ```ts
 * const yaml = generateConfigFile('db', { db: { type: 'postgresql', database: 'shop' } })
 * const example = generateEnvExample(['db'], undefined, false, { db: yaml })
 * ```
 */
export function generateEnvExample(features: FeatureId[], configs?: ModuleConfigs, includeDisabled = false, configContents: Record<string, string> = {}): string {
  const keys = new Set(['core', ...(configContents.serv ? ['serv'] : []), ...features.filter(feature => !['crypto', 'api-client', 'capacitor', 'datapipe'].includes(feature))])
  const allKeys = ['core', 'serv', 'db', 'cache', 'iam', 'storage', 'ai', 'vecdb', 'reach', 'payment', 'scheduler', 'deploy', 'audit', 'feedback']
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
    const section = renderEnvironment(variables.filter(variable => !variable.optional))
    const declaredOptional = renderEnvironment(variables.filter(variable => variable.optional))
    const activeNames = new Set(variables.map(variable => variable.name))
    const candidates = moduleEnvironmentVariables(key)
    const primitiveArrays = candidates.filter(variable => variable.constraint.includes('JSON 数组') && candidates.some(child => child.name === `${variable.name}_0` && !child.constraint.includes('JSON 对象')))
    const optional = renderEnvironment(candidates.filter(variable => !activeNames.has(variable.name)
      && !primitiveArrays.some(parent => variable.name.startsWith(`${parent.name}_`))
      && !variables.some(child => child.name.startsWith(`${variable.name}_`) && (variable.constraint.includes('JSON 对象') || variable.constraint.includes('JSON 数组')) && !variable.constraint.includes('false'))
      && (!(variable.constraint.includes('JSON 对象') || variable.constraint.includes('JSON 数组')) || variable.constraint.includes('false') || !candidates.some(child => child.name.startsWith(`${variable.name}_`)) || primitiveArrays.includes(variable))))
    const commented = (value: string) => value.split('\n').map(line => line && !line.startsWith('#') ? `# ${line}` : line).join('\n')
    sections.push(`# --- ${key} ---\n${keys.has(key) ? section : commented(section)}\n\n# 可选字段：先在 YAML 中启用对应配置块；下列变量名与字段路径一一对应。\n${commented(declaredOptional)}\n${commented(optional)}`)
  }
  return `${sections.join('\n\n')}\n`
}

/**
 * 为启用模块生成共享生产后端配置；凭据只列出必需入口，由私有环境注入。
 * 只返回文本，不连接服务，也不保证私有凭据已提供。
 * @param features - 本次启用的功能标识。
 * @param configs - 用户指定的模块配置。
 * @returns 共享生产后端的 dotenv 文本；凭据仅说明注入入口。
 * @example 模块内部上下文
 * ```ts
 * const dotenv = generateProductionEnvironment(['ai', 'cache', 'storage'], { db: { type: 'mysql', database: 'shop' } })
 * // AI 补齐 db/vecdb；生成 db/cache/storage/vecdb 服务 DNS，真实凭据另行注入。
 * ```
 */
export function generateProductionEnvironment(features: FeatureId[], configs?: ModuleConfigs): string {
  const enabled = new Set(features)
  if (enabled.has('ai')) {
    enabled.add('db')
    enabled.add('vecdb')
  }
  const sections = [
    '# 生产环境必须使用共享后端；以下服务名对应 Compose 内部 DNS。',
    '# 其他服务凭据通过部署 Secret / 进程环境或被忽略的 .env.local 注入。',
    'HAI_CORE_ENV=production',
    'HAI_CORE_LOGGING_LEVEL=info',
  ]
  if (enabled.has('db')) {
    const mysql = configs?.db?.type === 'mysql'
    const database = configs?.db?.type !== 'sqlite' && configs?.db?.database ? configs.db.database : 'hai'
    sections.push('', '# 必须私有注入 HAI_DB_PASSWORD；外部数据库可覆盖下列连接字段。', `HAI_DB_TYPE=${mysql ? 'mysql' : 'postgresql'}`, 'HAI_DB_HOST=db', `HAI_DB_PORT=${mysql ? 3306 : 5432}`, renderEnvironment([{ name: 'HAI_DB_DATABASE', path: 'db.database', value: database, constraint: '生产数据库名' }]), `HAI_DB_USER=${mysql ? 'root' : 'postgres'}`)
  }
  if (enabled.has('cache'))
    sections.push('', '# 必须私有注入 HAI_CACHE_PASSWORD。', 'HAI_CACHE_TYPE=redis', 'HAI_CACHE_HOST=cache', 'HAI_CACHE_PORT=6379')
  if (enabled.has('storage')) {
    sections.push('', '# 必须私有注入 HAI_STORAGE_ACCESSKEYID / HAI_STORAGE_SECRETACCESSKEY。', 'HAI_STORAGE_TYPE=s3', 'HAI_STORAGE_BUCKET=hai', 'HAI_STORAGE_REGION=us-east-1', 'HAI_STORAGE_ENDPOINT=http://storage:9000', 'HAI_STORAGE_FORCEPATHSTYLE=true', 'HAI_STORAGE_CREATEBUCKET=true')
  }
  if (enabled.has('vecdb'))
    sections.push('', '# 受保护的 Qdrant 必须私有注入 HAI_VECDB_APIKEY。', 'HAI_VECDB_TYPE=qdrant', 'HAI_VECDB_URL=http://vecdb:6333')
  if (enabled.has('ai'))
    sections.push('', '# 必须私有注入 HAI_AI_LLM_APIKEY 及所选模型的其它凭据；AI 自动复用已初始化的共享 db/vecdb。')
  if (enabled.has('reach')) {
    sections.push('', '# 必须私有注入 HAI_REACH_PROVIDERS 的真实 SMTP/SMS/API JSON（包含凭据）。', '# 空数组有意让配置校验拒绝启动，生产不得沿用开发 console Provider。', 'HAI_REACH_PROVIDERS=\'[]\'')
  }
  return `${sections.join('\n')}\n`
}

function generateDeployConfig(): string {
  return `# 部署已有镜像；运行 pnpm run deploy --build 可先构建再发布。
# SSH 参数由向导保存在本机 .env.<环境>.local；离线打包不要求 SSH。
provider:
  type: docker-ssh
  remote:
    baseDir: /opt/hai/apps
    runtime: auto # 优先 Podman，其次 Docker
  expose:
    hostPort: 18080
    containerPort: 3000
    # HTTPS 也可在 pnpm run deploy 的可选证书环节中配置。
    # https:
    #   type: files
    #   domain: app.example.com
    #   port: 443
    #   redirectHttp: true
    #   certificateFile: .hai/certificates/fullchain.pem
    #   privateKeyFile: .hai/certificates/privkey.pem
    # Let's Encrypt：type 改为 letsencrypt，HTTP hostPort 设为 80；
    # 以 email 和 acceptTerms: true 替代两个文件路径。

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
url: \${HAI_VECDB_URL:http://localhost:6333}
apiKey: \${HAI_VECDB_APIKEY:}

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
# 直连仅支持 HTTP(S) 根 url；apiKey 按 Bearer 网关协议发送，不提供 Chroma Cloud 配置。
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

# 生产示例：用下面 providers 整段替换上方控制台列表；保留需要的项。
# 数组索引从 0 开始，删掉某项后同步修改其余环境变量中的索引。
# providers:
  # SMTP 邮件
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
  #   accessKeyId: \${HAI_REACH_PROVIDERS_1_ACCESSKEYID}
  #   accessKeySecret: \${HAI_REACH_PROVIDERS_1_ACCESSKEYSECRET}
  #   signName: MyApp
  #   endpoint: dysmsapi.aliyuncs.com

  # 通用 API（按需开启；可对接应用自有投递服务）
  # - name: custom
  #   type: api
  #   url: https://notify.example.com/send
  #   method: POST # POST | PUT
  #   headers:
  #     Authorization: 'Bearer \${HAI_REACH_PROVIDERS_2_HEADERS_AUTHORIZATION}'
  #   timeout: 10000
  #   redirect: error # 普通消息才可显式 follow；敏感发送始终拒绝跳转。
  #   requireHttps: true # 强制 HTTPS；省略时生产敏感发送仍要求 HTTPS。

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

# 发送失败时最多尝试 5 次；等待时间从 1 分钟逐次加倍，最长 1 小时。
# 无法确认对方是否收到时停止自动重发，先核对投递结果。修改策略只影响以后进入队列的消息。
queue:
  maxAttempts: \${HAI_REACH_QUEUE_MAXATTEMPTS:5}
  retryDelayMs: \${HAI_REACH_QUEUE_RETRYDELAYMS:60000}
  maxRetryDelayMs: \${HAI_REACH_QUEUE_MAXRETRYDELAYMS:3600000}
`
}

function generateSchedulerConfig(): string {
  return `# =============================================================================
# 任务调度配置 (@h-ai/scheduler)
# =============================================================================

# 必须先初始化共享 @h-ai/reldb；执行日志和租约始终落库，不能设 false
enableDb: true

# 检查间隔（毫秒）
tickInterval: 1000

# 执行租约（1000～86400000 毫秒，运行中自动续期）；unknown 须人工核对并先停止旧执行
leaseMs: 300000

# 节点 ID 默认自动生成；多节点部署时每个实例应使用独立 ID。
# nodeId: worker-1
# 尝试日志保留策略（不删除执行journal与去重历史）
# maxLogs: 10000
# retentionDays: 30
`
}

function generateAuditConfig(): string {
  return `# =============================================================================
# 审计日志配置 (@h-ai/audit)
# =============================================================================

# 审计列表查询操作者名称时使用的用户表。使用框架 IAM 时保持下面三个默认值。
userTable: hai_iam_users

# 用户表主键列名
userIdColumn: id

# 用户名列名
userNameColumn: username

# 自动记录已接入框架的重要操作；includeReads=true 时也记录成功查询，会增加记录量。
# enabled=false 只关闭自动采集，业务主动调用 audit.log() 仍可写入。
capture:
  enabled: true
  includeReads: false

# enabled=true 后，最近 minDays 天的记录不能修改或删除；超过保护期也不会自动删除。
# 保护设置会存入数据库，删掉这一段会沿用已有设置；明确 enabled=false 才关闭保护。
retention:
  enabled: false
  minDays: 90

# fields 填额外的隐私字段名，例如 [customerPhone, idCard]，不区分大小写。
# 密码、令牌等凭据始终遮盖；enabled 只控制这里补充的业务字段，不恢复历史原文。
privacy:
  enabled: true
  fields: []

# 将审计另存为私有 JSONL 备份，启用前先初始化私有 Storage。
# batchSize 是每批读取条数；maxRecordBytes 是单条上限（字节），超限报错，不截断记录。
# schedule.enabled=true 按 cron 自动备份；例如 UTC 02:00 对应北京时间 10:00。
backup:
  enabled: false
  batchSize: 200
  maxRecordBytes: 1048576
  schedule:
    enabled: false
    cron: '0 2 * * *'
    timezone: UTC

# 按一段时间内的事件数量通知管理员；启用前配置 Reach，并将 provider 填为已注册的通道名称。
# 例子：5 分钟内登录失败/拒绝达到 10 次时通知安全团队；规则和定时检查需要分别启用。
alerts:
  enabled: false
  maxNotificationsPerCheck: 100
  rules: []
  # 用下面的 rules 列表替换空数组。
  # rules:
  #   - id: login-failures
  #     actions: [auth.login]
  #     outcomes: [failure, denied]
  #     threshold: 10
  #     windowSeconds: 300
  #     severity: warning
  #     targets: [{ id: security-team, provider: email, to: security@example.com }]
  schedule:
    enabled: false
    cron: '* * * * *'
    timezone: UTC
`
}

function generatePaymentConfig(): string {
  return `# =============================================================================
# 支付配置 (@h-ai/payment)
# =============================================================================

# 微信支付（仅公众号 JSAPI，需当前 appId 的 openid）
# wechat:
#   mchId: ''
#   apiV3Key: ''
#   serialNo: ''
#   privateKey: ''
#   platformKeys: # 必填；按 Wechatpay-Serial 精确选择平台证书/公钥，轮换时保留新旧项
#     PUB_KEY_ID_123: '' # 平台公钥 PEM；证书则以其真实序列号作为 key
#   appId: ''

# 支付宝（仅 H5/WAP，浏览器 POST 签名字段）
# alipay:
#   appId: ''
#   sellerId: '' # 必填；回调 seller_id 必须与此一致
#   privateKey: ''
#   alipayPublicKey: ''
#   returnUrl: 'https://app.example/payment/return' # 必填 HTTPS；回跳不代表已付款
#   signType: RSA2
#   sandbox: false

# Stripe（按需开启；先初始化共享 reldb，持久化渠道映射和幂等结果）
# stripe:
#   secretKey: ''
#   webhookSecret: ''
#   successUrl: 'https://app.example/payment/success?session_id={CHECKOUT_SESSION_ID}'
#   cancelUrl: 'https://app.example/payment/cancel' # 可选
#   webhookToleranceSeconds: 300
`
}

function generateFeedbackConfig(): string {
  return `# 问题反馈：生产使用共享数据库与私有存储；通知独立选择 disabled / console / reach。
appId: my-app
appVersion: 0.1.0
notificationMode: console
consoleContent: metadata
maxTotalBytes: 33554432
recipients: []
# Reach 模式设置真实 Provider 和接收方，不影响其它通知的免打扰策略。
# recipients:
#   - \${HAI_FEEDBACK_RECIPIENTS_0:}
notificationProvider: email
adminUrl: http://localhost:5173/#/feedback
collectionTimeoutMs: 60000
businessCollectionTimeoutMs: 30000
# 采集结束后回调；地址空值禁用，密钥只放服务端私有环境，不进入 PUBLIC_ 配置。
webhookUrl: ''
webhookSecret: ''
webhookTimeoutMs: 10000
workerIntervalMs: 1000
leaseMs: 30000
maxAttempts: 5
retentionDays: 30
maxAttachmentBytes: 5242880
envAllowlist:
  - NODE_ENV
  - TZ
`
}
