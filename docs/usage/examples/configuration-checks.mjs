/** 配置手册的可复现检查：调用公开 Schema 和纯函数，不读取凭据、不连接外部服务。 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { AIConfigSchema, AudioConfigSchema, ImageConfigSchema, KnowledgeConfigSchema } from '@h-ai/ai'
import { AuditInitConfigSchema } from '@h-ai/audit'
import { CacheConfigSchema } from '@h-ai/cache'
import { CoreConfigSchema, LoggingConfigSchema } from '@h-ai/core'
import { ChunkOptionsSchema, CleanOptionsSchema, datapipe } from '@h-ai/datapipe'
import { FeedbackConfigSchema } from '@h-ai/feedback'
import { AuthUiConfigSchema, CaptchaConfigSchema, LoginAccessConfigSchema, OtpConfigSchema, PasswordConfigSchema, SecurityConfigSchema, SessionConfigSchema } from '@h-ai/iam'
import { KitConfigSchema } from '@h-ai/kit'
import { StripeConfigSchema } from '@h-ai/payment'
import { ApiProviderConfigSchema, DndConfigSchema, ReachQueueConfigSchema, SmtpProviderConfigSchema } from '@h-ai/reach'
import { MysqlPoolConfigSchema, MysqlSslConfigSchema, PoolConfigSchema, SqliteOptionsSchema } from '@h-ai/reldb'
import { SchedulerConfigSchema } from '@h-ai/scheduler'
import { ServConfigSchema } from '@h-ai/serv'
import { LocalConfigSchema, PresignOptionsSchema } from '@h-ai/storage'
import { VecdbConfigSchema } from '@h-ai/vecdb'

const results = []
function add(id, output) {
  results.push({ id, output })
}
function reject(schema, input) {
  const result = schema.safeParse(input)
  assert.equal(result.success, false)
  return { accepted: false, fields: result.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })) }
}
function pick(value, keys) {
  return Object.fromEntries(keys.map(key => [key, value[key]]))
}

add('core', { metadataDefaults: CoreConfigSchema.parse({}), loggingObjectDefaults: LoggingConfigSchema.parse({}), unknownCoreField: reject(CoreConfigSchema, { orderFeature: true }) })
add('database-sqlite', { defaults: SqliteOptionsSchema.parse({}), worker: SqliteOptionsSchema.parse({ executor: 'worker' }), readOnly: SqliteOptionsSchema.parse({ readonly: true }) })
add('database-pools', { postgresql: PoolConfigSchema.parse({}), mysql: MysqlPoolConfigSchema.parse({}), mysqlUnsupportedIdleTimeout: reject(MysqlPoolConfigSchema, { idleTimeout: 30000 }), mysqlTlsObject: MysqlSslConfigSchema.parse({}) })
add('cache', { redisDefaults: CacheConfigSchema.parse({ type: 'redis' }), tlsEnabled: CacheConfigSchema.parse({ type: 'redis', tls: true, db: 2, keyPrefix: 'orders:' }), invalidDatabase: reject(CacheConfigSchema, { type: 'redis', db: 16 }) })
add('storage', { local: LocalConfigSchema.parse({ type: 'local', root: './private-data' }), defaultDownloadSignature: PresignOptionsSchema.parse({}), shortSignature: PresignOptionsSchema.parse({ expiresIn: 60 }), excessiveSignature: reject(PresignOptionsSchema, { expiresIn: 604801 }) })
add('iam-password', { defaults: PasswordConfigSchema.parse({}), strongerPolicy: PasswordConfigSchema.parse({ minLength: 12, minCharacterClasses: 3, requireInitialChange: true, preventSamePassword: true }) })
add('iam-session', { defaults: SessionConfigSchema.parse({}), restricted: SessionConfigSchema.parse({ maxAge: 1800, idleTimeout: 900, absoluteTimeout: 28800, terminalLimits: { web: 2, app: 1 } }), invalidLifetime: reject(SessionConfigSchema, { maxAge: 30 }) })
add('iam-lockout', { defaults: SecurityConfigSchema.parse({}), shortWindow: SecurityConfigSchema.parse({ failureWindow: 300, maxLoginAttempts: 3, lockoutDuration: 600 }), captcha: CaptchaConfigSchema.parse({}), otp: OtpConfigSchema.parse({}) })
add('iam-access', { defaults: LoginAccessConfigSchema.parse({}), workHours: LoginAccessConfigSchema.parse({ enabled: true, timezone: 'Asia/Shanghai', allowIps: ['192.0.2.0/24'], windows: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }] }), defaultLayout: AuthUiConfigSchema.parse({}), splitLayout: AuthUiConfigSchema.parse({ variant: 'split' }) })
add('http', { defaults: ServConfigSchema.parse({}), documented: ServConfigSchema.parse({ http: { docs: { requireAuth: true }, openapi: {} }, cors: { origin: 'https://app.example.invalid', credentials: true } }), kit: KitConfigSchema.parse({}), invalidPort: reject(ServConfigSchema, { server: { port: 70000 } }) })
const feedback = FeedbackConfigSchema.parse({ appId: 'documentation', notificationMode: 'console' })
add('feedback-collection', { defaults: pick(feedback, ['notificationMode', 'consoleContent', 'collectionTimeoutMs', 'businessCollectionTimeoutMs', 'workerIntervalMs', 'leaseMs', 'maxAttempts', 'retentionDays', 'webhookUrl', 'webhookTimeoutMs']), manualWorker: FeedbackConfigSchema.parse({ appId: 'documentation', notificationMode: 'disabled', workerIntervalMs: 0 }).workerIntervalMs, reachWithoutRecipients: reject(FeedbackConfigSchema, { appId: 'documentation' }) })
add('feedback-budgets', { defaults: pick(feedback, ['maxTotalBytes', 'maxAttachmentBytes', 'maxEvidenceBytes', 'maxEvidenceCount', 'maxReportsPerUserDay', 'maxBytesPerUserDay', 'maxStoredBytesPerScope', 'maxExportsPerReport', 'exportRetentionHours']), excessiveAttachment: reject(FeedbackConfigSchema, { appId: 'documentation', notificationMode: 'disabled', maxAttachmentBytes: 6 * 1024 * 1024 }) })
add('reach', { smtp: SmtpProviderConfigSchema.parse({ name: 'email', type: 'smtp', host: 'smtp.example.invalid', from: 'orders@example.invalid' }), api: ApiProviderConfigSchema.parse({ name: 'hook', type: 'api', url: 'https://notify.example.invalid' }), queue: ReachQueueConfigSchema.parse({}), dnd: DndConfigSchema.parse({}) })
add('audit', { defaults: AuditInitConfigSchema.parse({}), retentionObject: AuditInitConfigSchema.parse({ retention: {} }).retention, protected: AuditInitConfigSchema.parse({ retention: { enabled: true, minDays: 180 }, privacy: { fields: ['customerPhone'] } }).retention, noRule: reject(AuditInitConfigSchema, { alerts: { enabled: true } }) })
add('scheduler', { defaults: SchedulerConfigSchema.parse({}), shorterLease: SchedulerConfigSchema.parse({ leaseMs: 60000, retentionDays: 30 }), databaseCannotDisable: reject(SchedulerConfigSchema, { enableDb: false }) })
add('ai-models', { defaults: AIConfigSchema.parse({}), scenarios: AIConfigSchema.parse({ llm: { models: [{ id: 'fast', model: 'example-small' }, { id: 'deep', model: 'example-reasoning', timeout: 120000 }], scenarios: { chat: 'fast', reasoning: 'deep' } } }).llm })
add('ai-media', { audio: AudioConfigSchema.parse({}), image: ImageConfigSchema.parse({}), smallerImages: ImageConfigSchema.parse({ maxImages: 1, maxImageBytes: 2 * 1024 * 1024 }) })
add('ai-knowledge', { knowledge: KnowledgeConfigSchema.parse({}), qdrant: VecdbConfigSchema.parse({ type: 'qdrant' }), lancedb: VecdbConfigSchema.parse({ type: 'lancedb', path: './data/vectors' }), missingProvider: reject(VecdbConfigSchema, {}) })
const source = '<p>Order\n\n  documentation@example.invalid https://example.invalid</p>'
const cleanDefault = datapipe.clean(source)
const cleanPrivate = datapipe.clean(source, { removeEmails: true, removeUrls: true })
assert.ok(cleanDefault.success && cleanPrivate.success)
add('text', { defaultOptions: CleanOptionsSchema.parse({}), defaultResult: cleanDefault.data, privateResult: cleanPrivate.data, chunks: ChunkOptionsSchema.parse({ mode: 'character' }) })
add('payment', { stripe: pick(StripeConfigSchema.parse({ secretKey: 'sk_test_documentation_placeholder', webhookSecret: 'documentation-placeholder', successUrl: 'https://shop.example.invalid/success' }), ['successUrl', 'webhookToleranceSeconds']), invalidKey: reject(StripeConfigSchema, { secretKey: 'invalid', webhookSecret: 'documentation-placeholder', successUrl: 'https://shop.example.invalid/success' }) })

assert.equal(results.length, 20)
process.stdout.write(`${JSON.stringify({ source: 'public schemas and local pure functions', externalConnections: false, cases: results.length, results }, null, 2)}\n`)
