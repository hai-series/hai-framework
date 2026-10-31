/**
 * 部署中间件的后端与连接字段目录，供扫描、CLI 和容器规划共同使用。
 * 字段名与对应模块公开 Schema 保持一致，不把模块依赖等同于必须创建外部服务。
 * @module deploy-middleware
 */
import type { ServiceType } from './deploy-types.js'
import { provisionerFields } from './deploy-config.js'
import { deployM } from './deploy-i18n.js'

/**
 * 连接字段；例如 `{ name: 'port', defaultValue: '5432', kind: 'port' }`。
 * @example
 * ```ts
 * import type { MiddlewareField } from '@h-ai/deploy'
 * const field: MiddlewareField = { name: 'port', defaultValue: '5432', required: true, kind: 'port' }
 * ```
 */
export interface MiddlewareField {
  /** 模块配置字段名，camelCase 不拆词。 */
  name: string
  /** 无现有配置时使用的提示默认值。 */
  defaultValue?: string
  /** 是否为连接所必需；可选项允许留空。 */
  required?: boolean
  /** 密码输入与私有环境文件写入标记。 */
  secret?: boolean
  /** 自建服务会定稿此字段，默认模式允许尚未生成。 */
  managed?: boolean
  /** 交互校验类型；端口范围为 1–65535。 */
  kind?: 'port' | 'boolean' | 'number' | 'url'
  /** 数值下限；未声明时为 0。 */
  minimum?: number
  /** 数值上限；例如 Redis db 为 15。 */
  maximum?: number
}

/**
 * 后端目录项；例如 PostgreSQL 对应 `backend: 'postgresql'`。
 * @example
 * ```ts
 * import type { MiddlewareBackend } from '@h-ai/deploy'
 * const backend: MiddlewareBackend = { backend: 'postgresql', label: 'PostgreSQL', purpose: 'deploy_purposeDatabase', fields: [{ name: 'database', required: true }] }
 * ```
 */
export interface MiddlewareBackend {
  /** 模块 Schema 接受的后端标识。 */
  backend: string
  /** 可直接识别的产品名称。 */
  label: string
  /** 用途说明的 i18n 消息键。 */
  purpose: Parameters<typeof deployM>[0]
  /** 云自动开通器；缺失表示不能自动开通该云服务。 */
  provisioner?: 'neon' | 'upstash' | 'cloudflare-r2' | 'resend' | 'aliyun'
  /** 云凭据字段，由所属开通器 Schema 派生。 */
  cloudFields?: string[]
  /** 是否支持容器自动创建；省略为支持。 */
  containerSupported?: boolean
  /** 自建容器的可选实现，配置位置属于 deploy.container。 */
  containerOptions?: Array<{
    /** deploy.container 中的字段。 */
    field: string
    /** 对应细项环境变量。 */
    variable: string
    /** 输入提示的消息键。 */
    purpose: Parameters<typeof deployM>[0]
    /** 未配置时的选择。 */
    defaultValue: string
    /** 可选实现。 */
    choices: Array<{ /** 显示名称。 */ label: string, /** 配置值。 */ value: string }>
  }>
  /** 自定义连接需要逐项输入的字段。 */
  fields: MiddlewareField[]
}

const field = (name: string, defaultValue?: string, kind?: MiddlewareField['kind'], secret = false): MiddlewareField => ({ name, defaultValue, kind, secret })
const required = (name: string, defaultValue?: string, kind?: MiddlewareField['kind']): MiddlewareField => ({ ...field(name, defaultValue, kind), required: true })

/**
 * 所有可部署中间件的连接目录。
 * SQLite、memory、local 与 disabled 保留本地/禁用语义，不创建无关 sidecar。
 * 目录同时描述本机、禁用、自建与云后端；存在依赖不等于必须开通新资源。
 * @example
 * ```ts
 * import { DEPLOY_MIDDLEWARE, describeMiddlewareBackend } from '@h-ai/deploy'
 * const choices = DEPLOY_MIDDLEWARE.db.map(backend => ({ value: backend.backend, description: describeMiddlewareBackend(backend) }))
 * ```
 */
export const DEPLOY_MIDDLEWARE: Record<ServiceType, MiddlewareBackend[]> = {
  db: [
    { backend: 'sqlite', label: 'SQLite', purpose: 'deploy_purposeSqlite', fields: [required('database', './data/app.db')] },
    ...(['postgresql', 'mysql'] as const).map(backend => ({
      backend,
      label: backend === 'mysql' ? 'MySQL' : 'PostgreSQL',
      purpose: 'deploy_purposeDatabase' as const,
      provisioner: backend === 'postgresql' ? 'neon' as const : undefined,
      cloudFields: backend === 'postgresql' ? provisionerFields('neon') : undefined,
      fields: [field('url', '', 'url', true), required('host', 'localhost'), required('port', backend === 'mysql' ? '3306' : '5432', 'port'), required('database', 'hai'), field('user', 'hai'), field('password', '', undefined, true), field('ssl', 'false')],
    })),
  ],
  cache: [
    { backend: 'memory', label: 'Memory', purpose: 'deploy_purposeMemory', fields: [] },
    { backend: 'redis', label: 'Redis', purpose: 'deploy_purposeCache', provisioner: 'upstash', cloudFields: provisionerFields('upstash'), fields: [field('url', '', 'url', true), required('host', 'localhost'), required('port', '6379', 'port'), field('password', '', undefined, true), { ...field('db', '0', 'number'), maximum: 15 }, field('tls', 'false', 'boolean'), field('keyPrefix'), field('connectTimeout', '10000', 'number'), field('commandTimeout', '5000', 'number')] },
  ],
  storage: [
    { backend: 'local', label: 'Local filesystem', purpose: 'deploy_purposeLocal', fields: [required('root', './data/storage')] },
    { backend: 's3', label: 'S3 / RustFS / MinIO / Cloudflare R2', purpose: 'deploy_purposeStorage', provisioner: 'cloudflare-r2', cloudFields: provisionerFields('cloudflare-r2'), containerOptions: [{ field: 's3Engine', variable: 'HAI_DEPLOY_CONTAINER_S3ENGINE', purpose: 'deploy_s3Engine', defaultValue: 'rustfs', choices: [{ label: 'RustFS', value: 'rustfs' }, { label: 'MinIO', value: 'minio' }] }], fields: [field('endpoint', '', 'url'), required('bucket', 'hai'), required('region', 'us-east-1'), { ...required('accessKeyId'), managed: true }, { ...required('secretAccessKey'), secret: true }, field('forcePathStyle', 'true', 'boolean')] },
  ],
  vecdb: [
    { backend: 'lancedb', label: 'LanceDB', purpose: 'deploy_purposeLocal', fields: [required('path', './data/vectors')] },
    { backend: 'qdrant', label: 'Qdrant', purpose: 'deploy_purposeVector', fields: [required('url', 'http://localhost:6333', 'url'), field('apiKey', '', undefined, true)] },
    { backend: 'pgvector', label: 'PostgreSQL / pgvector', purpose: 'deploy_purposeVector', fields: [field('url', '', 'url', true), required('host', 'localhost'), required('port', '5432', 'port'), required('database', 'hai'), field('user', 'hai'), field('password', '', undefined, true)] },
    { backend: 'chroma', label: 'Chroma', purpose: 'deploy_purposeVector', fields: [required('url', 'http://localhost:8000', 'url')] },
  ],
  ldap: [
    { backend: 'disabled', label: 'Disabled', purpose: 'deploy_purposeDisabled', fields: [] },
    { backend: 'ldap', label: 'LDAP / OpenLDAP', purpose: 'deploy_purposeLdap', fields: [required('url', 'ldap://localhost:389', 'url'), required('bindDn', 'cn=admin,dc=example,dc=org'), { ...required('bindPassword'), secret: true }, required('searchBase', 'dc=example,dc=org'), field('searchFilter', '(uid={{username}})'), field('usernameAttribute', 'uid'), field('emailAttribute', 'mail'), field('displayNameAttribute', 'cn'), field('useTls', 'false', 'boolean'), { ...field('connectTimeout', '5000', 'number'), minimum: 1000 }] },
  ],
  email: [
    { backend: 'console', label: 'Console', purpose: 'deploy_purposeConsole', fields: [] },
    { backend: 'smtp', label: 'SMTP', purpose: 'deploy_purposeEmail', provisioner: 'resend', cloudFields: provisionerFields('resend'), fields: [required('host', 'localhost'), required('port', '465', 'port'), field('secure', 'true', 'boolean'), field('user'), field('pass', '', undefined, true), required('from', 'noreply@example.com')] },
    { backend: 'api', containerSupported: false, label: 'HTTP notification API', purpose: 'deploy_purposeEmail', fields: [required('url', '', 'url'), field('method', 'POST'), field('headers'), field('timeout', '10000', 'number')] },
  ],
  sms: [
    { backend: 'console', label: 'Console', purpose: 'deploy_purposeConsole', fields: [] },
    { backend: 'aliyun-sms', containerSupported: false, label: 'Aliyun SMS', purpose: 'deploy_purposeSms', provisioner: 'aliyun', cloudFields: provisionerFields('aliyun'), fields: [required('accessKeyId'), { ...required('accessKeySecret'), secret: true }, required('signName'), field('endpoint', 'dysmsapi.aliyuncs.com')] },
    { backend: 'api', containerSupported: false, label: 'HTTP notification API', purpose: 'deploy_purposeSms', fields: [required('url', '', 'url'), field('method', 'POST'), field('headers'), field('timeout', '10000', 'number')] },
  ],
}

/**
 * 返回当前语言的后端用途说明。
 * @param backend - 部署目录中的后端条目。
 * @returns 当前 locale 的用途说明。
 * @example
 * ```ts
 * import { DEPLOY_MIDDLEWARE, describeMiddlewareBackend } from '@h-ai/deploy'
 * const backend = DEPLOY_MIDDLEWARE.db.find(item => item.backend === 'postgresql')
 * if (backend) {
 *   const description = describeMiddlewareBackend(backend)
 * }
 * ```
 */
export function describeMiddlewareBackend(backend: Pick<MiddlewareBackend, 'purpose'>): string {
  return deployM(backend.purpose)
}
