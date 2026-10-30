/**
 * @h-ai/deploy — 容器编排文件生成
 *
 * 根据应用扫描结果生成 compose 文件与运行期环境：按需为 db/cache/storage
 * 追加自建 sidecar 服务，并注入对应的 HAI_DB / HAI_CACHE / HAI_STORAGE 覆盖变量。
 * 敏感值仅写入受保护的环境文件，应用与中间件分开，禁止进入 compose 文件。
 * @module deploy-container-compose
 */

import type { DockerSshProviderConfig } from '../deploy-config.js'
import type { DeployAppOptions, ScanResult, ServiceType } from '../deploy-types.js'
import { randomBytes } from 'node:crypto'
import { TrustedProxiesSchema } from '@h-ai/core'
import { resolveTransportBodyLimits } from '@h-ai/crypto'
import { stringify } from 'yaml'
import { mergeEnvironmentLayers } from '../deploy-environment.js'
import { usesDefaultMiddleware } from '../deploy-functions.js'
import { CERTBOT_IMAGE } from './deploy-https.js'

/** sidecar 镜像固定版本，避免 `:latest` 漂移导致行为变化。 */
const IMAGES = {
  postgres: 'docker.io/library/postgres:16.15-alpine',
  mysql: 'docker.io/library/mysql:8.4.11',
  redis: 'docker.io/library/redis:7.4.11-alpine',
  rustfs: 'ghcr.io/rustfs/rustfs:1.0.1',
  minio: 'ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z',
  qdrant: 'docker.io/qdrant/qdrant:v1.19.2',
  pgvector: 'docker.io/pgvector/pgvector:0.8.0-pg17',
  chroma: 'docker.io/chromadb/chroma:1.5.5',
  ldap: 'docker.io/osixia/openldap:1.5.0',
  smtp: 'docker.io/axllent/mailpit:v1.27.4',
  nginx: 'docker.io/nginxinc/nginx-unprivileged:1.29.8-alpine',
} as const

// 旧版本曾把镜像原生变量保存到应用环境；读取旧配置时也不再传给业务容器。
const CONTAINER_ENV_KEYS = new Set([
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'MYSQL_ROOT_PASSWORD',
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'RUSTFS_ACCESS_KEY',
  'RUSTFS_SECRET_KEY',
  'RUSTFS_ADDRESS',
  'RUSTFS_VOLUMES',
  'RUSTFS_CONSOLE_ENABLE',
  'LDAP_DOMAIN',
  'LDAP_ORGANISATION',
  'LDAP_ADMIN_PASSWORD',
  'LDAP_TLS',
])

/**
 * compose 服务定义（结构化对象，交由 yaml 序列化）。
 * 内部 Compose 文档对象，不是公开部署配置 Schema。
 * @example 模块内部上下文
 * ```ts
 * const service: ComposeService = { image: 'registry.example.org/shop:1.0.0', ports: ['8080:3000'] }
 * ```
 */
type ComposeService = Record<string, unknown>

/**
 * sidecar 规划结果。
 * 无中间件应用的空计划是合法输入；有连接时 env/secrets 可能含私密值，不能整体展示。
 * @example 模块内部上下文
 * ```ts
 * const sidecar: SidecarPlan = { services: [], composeServices: {}, volumes: {}, appVolumes: [], env: {}, containerEnv: {}, dependsOn: [], secrets: [] }
 * const yaml = generateComposeFile({ projectName: 'shop', appVersion: '1.0.0', imageRef: 'shop:1.0.0-build1', hostPort: 8080, containerPort: 3000, sidecar })
 * ```
 */
export interface SidecarPlan {
  /** 实际启用的自建服务 */
  services: ServiceType[]
  /** compose services 片段（不含 app） */
  composeServices: Record<string, ComposeService>
  /** 命名卷 */
  volumes: Record<string, unknown>
  /** 挂载到 主应用容器的卷（如 sqlite/lancedb 的本地数据目录持久化） */
  appVolumes: string[]
  /** 框架 HAI_* 配置，允许保存到工程环境并注入应用。 */
  env: Record<string, string>
  /** 镜像要求的原生变量，仅写 middleware-runtime.env 并注入中间件。 */
  containerEnv: Record<string, string>
  /** serv 服务的 depends_on 列表 */
  dependsOn: string[]
  /** 需要在日志中脱敏的敏感值 */
  secrets: string[]
}

/**
 * 运行期环境构建结果。
 * @example 模块内部上下文
 * ```ts
 * const plan: RuntimeEnvPlan = { env: { NODE_ENV: 'production' }, sidecar: { services: [], composeServices: {}, volumes: {}, appVolumes: [], env: {}, containerEnv: {}, dependsOn: [], secrets: [] } }
 * const content = serializeEnvFile(plan.env)
 * ```
 */
export interface RuntimeEnvPlan {
  /** 完整运行期环境（写入 .env.runtime） */
  env: Record<string, string>
  /** sidecar 规划 */
  sidecar: SidecarPlan
}

/** 生成随机密码（url 安全）。 */
function generatePassword(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * 生成首次部署的候选值，不读取或创建打包机长期凭据缓存。
 * 服务器 apply 阶段以项目自己的私有状态定稿，后续电脑生成的候选不会改密码。
 * @returns 本包的私有候选值。
 */
function createSidecarCandidates(): Record<string, string> {
  return {
    dbPassword: generatePassword(),
    storagePassword: generatePassword(),
    ldapPassword: generatePassword(),
  }
}

/** 为 app 追加本地数据卷（sqlite / lancedb 等文件型后端持久化）。 */
function addAppDataVolume(plan: SidecarPlan, projectName: string): void {
  const mount = `${projectName}-data:/app/data`
  if (!plan.appVolumes.includes(mount)) {
    plan.appVolumes.push(mount)
    plan.volumes[`${projectName}-data`] = null
  }
}

/** PostgreSQL sidecar。 */
function planPostgresDb(plan: SidecarPlan, projectName: string, password: string, net: string[]): void {
  plan.services.push('db')
  plan.dependsOn.push('db')
  plan.composeServices.db = {
    image: IMAGES.postgres,
    container_name: `hai-${projectName}-db`,
    restart: 'unless-stopped',
    env_file: ['middleware-runtime.env'],
    volumes: [`${projectName}-db-data:/var/lib/postgresql/data`],
    healthcheck: { test: ['CMD', 'pg_isready', '-h', '127.0.0.1', '-U', 'hai', '-d', 'hai'], interval: '2s', timeout: '5s', retries: 60 },
    networks: net,
  }
  plan.volumes[`${projectName}-db-data`] = null
  plan.containerEnv.POSTGRES_USER = 'hai'
  plan.containerEnv.POSTGRES_PASSWORD = password
  plan.containerEnv.POSTGRES_DB = 'hai'
  plan.env.HAI_DB = JSON.stringify({ type: 'postgresql', url: `postgresql://hai:${password}@db:5432/hai`, database: 'hai' })
  plan.secrets.push(password)
}

/** MySQL sidecar。 */
function planMysqlDb(plan: SidecarPlan, projectName: string, password: string, net: string[]): void {
  plan.services.push('db')
  plan.dependsOn.push('db')
  plan.composeServices.db = {
    image: IMAGES.mysql,
    container_name: `hai-${projectName}-db`,
    restart: 'unless-stopped',
    env_file: ['middleware-runtime.env'],
    volumes: [`${projectName}-db-data:/var/lib/mysql`],
    healthcheck: { test: ['CMD-SHELL', 'mysqladmin ping -h 127.0.0.1 --silent'], interval: '2s', timeout: '5s', retries: 60 },
    networks: net,
  }
  plan.volumes[`${projectName}-db-data`] = null
  plan.containerEnv.MYSQL_ROOT_PASSWORD = password
  plan.containerEnv.MYSQL_DATABASE = 'hai'
  plan.containerEnv.MYSQL_USER = 'hai'
  plan.containerEnv.MYSQL_PASSWORD = password
  plan.env.HAI_DB = JSON.stringify({ type: 'mysql', url: `mysql://hai:${password}@db:3306/hai`, database: 'hai' })
  plan.secrets.push(password)
}

/** Redis sidecar。 */
function planRedisCache(plan: SidecarPlan, projectName: string, net: string[]): void {
  plan.services.push('cache')
  plan.dependsOn.push('cache')
  plan.composeServices.cache = {
    image: IMAGES.redis,
    container_name: `hai-${projectName}-cache`,
    restart: 'unless-stopped',
    healthcheck: { test: ['CMD', 'redis-cli', 'ping'], interval: '2s', timeout: '5s', retries: 60 },
    networks: net,
  }
  plan.env.HAI_CACHE = JSON.stringify({ type: 'redis', url: 'redis://cache:6379' })
}

/** S3 协议与服务实现分离；RustFS/MinIO 使用相同应用契约及幂等 bucket 初始化。 */
function planS3Storage(plan: SidecarPlan, projectName: string, password: string, net: string[], engine: 'rustfs' | 'minio', configured: Record<string, unknown> = {}): void {
  plan.services.push('storage')
  plan.dependsOn.push('storage')
  plan.composeServices.storage = {
    image: IMAGES[engine],
    container_name: `hai-${projectName}-storage`,
    restart: 'unless-stopped',
    ...(engine === 'minio' ? { command: ['server', '/data'] } : {}),
    healthcheck: { test: engine === 'rustfs' ? ['CMD', 'curl', '--noproxy', '*', '-fsS', 'http://127.0.0.1:9000/minio/health/ready'] : ['CMD', 'mc', 'ready', 'http://127.0.0.1:9000'], interval: '2s', timeout: '5s', retries: 60 },
    env_file: ['middleware-runtime.env'],
    volumes: [`${projectName}-storage-data:/data`],
    networks: net,
  }
  plan.volumes[`${projectName}-storage-data`] = null
  if (engine === 'rustfs') {
    Object.assign(plan.containerEnv, { RUSTFS_ACCESS_KEY: 'hai-storage', RUSTFS_SECRET_KEY: password, RUSTFS_ADDRESS: '0.0.0.0:9000', RUSTFS_VOLUMES: '/data', RUSTFS_CONSOLE_ENABLE: 'false' })
  }
  else {
    Object.assign(plan.containerEnv, { MINIO_ROOT_USER: 'hai-storage', MINIO_ROOT_PASSWORD: password })
  }
  plan.env.HAI_STORAGE = JSON.stringify({
    type: 's3',
    endpoint: 'http://storage:9000',
    bucket: configured.bucket || 'hai',
    region: configured.region || 'us-east-1',
    // 自建只替换连接和托管凭据，不能丢失对象前缀、外部签名地址或操作日志策略。
    ...Object.fromEntries(['prefix', 'publicEndpoint', 'publicUrl', 'operationLog'].filter(name => configured[name] !== undefined).map(name => [name, configured[name]])),
    accessKeyId: 'hai-storage',
    secretAccessKey: password,
    forcePathStyle: true,
    createBucket: true,
  })
  plan.env.HAI_STORAGE_CREATEBUCKET = 'true'
  plan.secrets.push(password)
}

/** Qdrant 向量库 sidecar。 */
function planQdrantVecdb(plan: SidecarPlan, projectName: string, net: string[]): void {
  plan.services.push('vecdb')
  plan.dependsOn.push('vecdb')
  plan.composeServices.vecdb = {
    image: IMAGES.qdrant,
    container_name: `hai-${projectName}-vecdb`,
    restart: 'unless-stopped',
    volumes: [`${projectName}-vecdb-data:/qdrant/storage`],
    networks: net,
  }
  plan.volumes[`${projectName}-vecdb-data`] = null
  plan.env.HAI_VECDB = JSON.stringify({ type: 'qdrant', url: 'http://vecdb:6333' })
}

/** pgvector 向量库 sidecar（PostgreSQL + pgvector 扩展）。 */
function planPgvectorVecdb(plan: SidecarPlan, projectName: string, password: string, net: string[]): void {
  plan.services.push('vecdb')
  plan.dependsOn.push('vecdb')
  plan.composeServices.vecdb = {
    image: IMAGES.pgvector,
    container_name: `hai-${projectName}-vecdb`,
    restart: 'unless-stopped',
    env_file: ['middleware-runtime.env'],
    volumes: [`${projectName}-vecdb-data:/var/lib/postgresql/data`],
    networks: net,
  }
  plan.volumes[`${projectName}-vecdb-data`] = null
  // 与 postgres db sidecar 共用 POSTGRES_* 凭据（不同实例、不同卷，值一致即可）。
  plan.containerEnv.POSTGRES_USER = 'hai'
  plan.containerEnv.POSTGRES_PASSWORD = password
  plan.containerEnv.POSTGRES_DB = 'hai'
  plan.env.HAI_VECDB = JSON.stringify({ type: 'pgvector', url: `postgresql://hai:${password}@vecdb:5432/hai`, database: 'hai' })
  plan.secrets.push(password)
}

/** Chroma 向量库 sidecar。 */
function planChromaVecdb(plan: SidecarPlan, projectName: string, net: string[]): void {
  plan.services.push('vecdb')
  plan.dependsOn.push('vecdb')
  plan.composeServices.vecdb = {
    image: IMAGES.chroma,
    container_name: `hai-${projectName}-vecdb`,
    restart: 'unless-stopped',
    volumes: [`${projectName}-vecdb-data:/data`],
    networks: net,
  }
  plan.volumes[`${projectName}-vecdb-data`] = null
  plan.env.HAI_VECDB = JSON.stringify({ type: 'chroma', url: 'http://vecdb:8000' })
}

/**
 * 解析 keep 策略；保留内部连接仍交付对应 sidecar，未选择的服务保持不变。
 * @param scan - 实际配置扫描结果。
 * @param options - 本次部署策略。
 * @returns 与执行端共用的有效策略，不读写文件或凭据。
 * @example 模块内部上下文
 * ```ts
 * const { scanApp } = await import('../deploy-scanner.js')
 * const scanned = await scanApp(process.cwd())
 * if (!scanned.success) throw new Error(scanned.error.message)
 * const options = resolveSidecarOptions(scanned.data, { serviceModes: { db: 'keep' } })
 * ```
 */
export function resolveSidecarOptions(scan: ScanResult, options?: DeployAppOptions): DeployAppOptions {
  // 保持配置不变仍需交付自建服务镜像；已保存的容器服务地址可明确区分外部连接。
  const serviceModes = { ...options?.serviceModes }
  for (const requirement of scan.middlewares ?? []) {
    // 规划描述完整拓扑；selectedServices 只限制后续归档和更新，不能让未选自建依赖消失。
    const mode = serviceModes[requirement.envPrefix] ?? serviceModes[requirement.service]
    if (mode !== 'keep')
      continue
    const endpoint = requirement.config.url ?? requirement.config.endpoint
    let host = requirement.config.host
    if (typeof endpoint === 'string') {
      try {
        host = new URL(endpoint).hostname
      }
      catch {
        continue
      }
    }
    if (host === requirement.service || ['sqlite', 'local', 'memory', 'lancedb'].includes(requirement.backend)) {
      serviceModes[requirement.envPrefix] = 'default'
      serviceModes[requirement.service] = 'default'
    }
  }
  return { ...options, serviceModes }
}

/**
 * 复用实际编排规则生成 sidecar；secretValues 仅供只读计划提供空占位值，执行时生成私有候选。
 * 仅为 requiredServices 中采用 default 且无 Provisioner 配置的服务规划匹配后端；文件后端共用 app 数据卷。
 * @param _appDir - 调用方应用目录上下文；凭据不在此落盘。
 * @param projectName - 部署项目身份。
 * @param scan - 实际依赖与配置扫描结果。
 * @param provisionEnv - 已开通服务的环境变量。
 * @param options - 执行选项。
 * @param s3Engine - S3 服务实现。
 * @param secretValues - 内部规划的凭据占位值，不是公开配置。
 * @returns sidecar 计划，env 和 secrets 不得整体输出。
 * @example 模块内部上下文
 * ```ts
 * const { scanApp } = await import('../deploy-scanner.js')
 * const scanned = await scanApp(process.cwd())
 * if (!scanned.success) throw new Error(scanned.error.message)
 * const sidecar = planSidecars(process.cwd(), 'shop', scanned.data, {}, { serviceModes: { db: 'keep' } })
 * ```
 */
export function planSidecars(
  _appDir: string,
  projectName: string,
  scan: ScanResult,
  provisionEnv: Record<string, string>,
  options?: DeployAppOptions,
  s3Engine: 'rustfs' | 'minio' = 'rustfs',
  secretValues?: Record<string, string>,
): SidecarPlan {
  options = resolveSidecarOptions(scan, options)
  const plan: SidecarPlan = {
    services: [],
    composeServices: {},
    volumes: {},
    appVolumes: [],
    env: {},
    containerEnv: {},
    dependsOn: [],
    secrets: [],
  }
  // 全部保持不变时，不生成自建中间件候选。
  if (!scan.requiredServices.some(service => usesDefaultMiddleware(scan, service, options)))
    return plan
  const secrets = secretValues ?? createSidecarCandidates()
  const net = ['hai-app']
  const backends = scan.serviceBackends

  for (const service of scan.requiredServices) {
    if (!usesDefaultMiddleware(scan, service, options))
      continue
    if (service === 'db' && !provisionEnv.HAI_DB) {
      const backend = backends.db ?? 'postgresql'
      if (backend === 'mysql')
        planMysqlDb(plan, projectName, secrets.dbPassword, net)
      else if (backend === 'sqlite')
        addAppDataVolume(plan, projectName) // 文件库：仅持久化数据目录，保留应用自身 sqlite 配置
      else
        planPostgresDb(plan, projectName, secrets.dbPassword, net)
    }
    else if (service === 'cache' && !provisionEnv.HAI_CACHE) {
      if ((backends.cache ?? 'redis') === 'redis')
        planRedisCache(plan, projectName, net)
    }
    else if (service === 'storage' && !provisionEnv.HAI_STORAGE) {
      if ((backends.storage ?? 's3') === 's3')
        planS3Storage(plan, projectName, secrets.storagePassword, net, s3Engine, scan.middlewares?.find(item => item.service === 'storage')?.config)
      else
        addAppDataVolume(plan, projectName)
    }
    else if (service === 'vecdb' && !provisionEnv.HAI_VECDB) {
      const backend = backends.vecdb ?? 'qdrant'
      if (backend === 'pgvector')
        planPgvectorVecdb(plan, projectName, secrets.dbPassword, net)
      else if (backend === 'chroma')
        planChromaVecdb(plan, projectName, net)
      else if (backend === 'lancedb')
        addAppDataVolume(plan, projectName) // 嵌入式：持久化本地向量文件
      else
        planQdrantVecdb(plan, projectName, net)
    }
    else if (service === 'ldap' && backends.ldap === 'ldap' && !provisionEnv.HAI_IAM_LDAP) {
      const password = secrets.ldapPassword ?? secrets.dbPassword
      plan.services.push('ldap')
      plan.dependsOn.push('ldap')
      plan.composeServices.ldap = { image: IMAGES.ldap, restart: 'unless-stopped', env_file: ['middleware-runtime.env'], networks: net, volumes: [`${projectName}-ldap-data:/var/lib/ldap`, `${projectName}-ldap-config:/etc/ldap/slapd.d`] }
      plan.volumes[`${projectName}-ldap-data`] = null
      plan.volumes[`${projectName}-ldap-config`] = null
      Object.assign(plan.containerEnv, { LDAP_DOMAIN: 'example.org', LDAP_ORGANISATION: 'HAI', LDAP_ADMIN_PASSWORD: password, LDAP_TLS: 'false' })
      Object.assign(plan.env, { HAI_IAM_LOGIN_LDAP: 'true', HAI_IAM_LDAP: JSON.stringify({ url: 'ldap://ldap:389', bindDn: 'cn=admin,dc=example,dc=org', bindPassword: password, searchBase: 'dc=example,dc=org' }) })
      plan.secrets.push(password)
    }
    else if (service === 'email' && (scan.middlewares ? scan.middlewares.some(item => item.service === 'email' && item.backend === 'smtp' && (options?.serviceModes?.[item.envPrefix] ?? options?.serviceModes?.email ?? 'default') === 'default') : backends.email === 'smtp') && !provisionEnv.HAI_REACH_PROVIDERS) {
      plan.services.push('email')
      plan.dependsOn.push('email')
      plan.composeServices.email = { image: IMAGES.smtp, restart: 'unless-stopped', networks: net }
      const requirements = scan.middlewares?.filter(item => item.service === 'email' && item.backend === 'smtp' && ['default', undefined].includes(options?.serviceModes?.[item.envPrefix] ?? options?.serviceModes?.email))
      if (requirements?.length) {
        for (const requirement of requirements)
          plan.env[requirement.envPrefix] = JSON.stringify({ name: requirement.config.name ?? 'email', type: 'smtp', host: 'email', port: 1025, secure: false, from: 'noreply@example.com' })
      }
      else if (!scan.middlewares) {
        plan.env.HAI_REACH_PROVIDERS_0 = JSON.stringify({ name: 'email', type: 'smtp', host: 'email', port: 1025, secure: false, from: 'noreply@example.com' })
      }
    }
  }

  return plan
}

/**
 * 构建运行期环境变量并规划 sidecar。
 *
 * 合并顺序（后者覆盖前者）：目标环境默认 < 应用显式配置 < sidecar 自建 < Provisioner 输出。
 * NODE_ENV 默认按目标模式选择：dev/development 为 development，test 为 test，其余为 production。
 * @param appDir - 应用根目录
 * @param projectName - 项目名
 * @param scan - 扫描结果
 * @param provisionEnv - Provisioner 输出环境变量
 * @param containerPort - 容器内监听端口
 * @returns 运行期环境与 sidecar 规划
 * @param options - 本次操作选项；字段含义见各子项。
 * @param appEnv - 已加载的应用变量，和云开通结果分别传入。
 * @param s3Engine - 自建 S3 服务实现；协议仍为 s3，默认 rustfs。
 * @example 模块内部上下文
 * ```ts
 * const { scanApp } = await import('../deploy-scanner.js')
 * const scanned = await scanApp(process.cwd())
 * if (!scanned.success) throw new Error(scanned.error.message)
 * const plan = buildRuntimeEnv(process.cwd(), 'shop', scanned.data, {}, 3000, { environment: 'prod' }, { NODE_ENV: 'production' })
 * const text = serializeEnvFile(plan.env)
 * ```
 */
export function buildRuntimeEnv(
  appDir: string,
  projectName: string,
  scan: ScanResult,
  provisionEnv: Record<string, string>,
  containerPort: number,
  options?: DeployAppOptions,
  appEnv: Record<string, string> = {},
  s3Engine: 'rustfs' | 'minio' = 'rustfs',
): RuntimeEnvPlan {
  const sidecar = planSidecars(appDir, projectName, scan, provisionEnv, options, s3Engine)
  const environment = options?.environment ?? appEnv.HAI_DEPLOY_ENVIRONMENT ?? 'prod'
  const nodeEnv = environment === 'dev' || environment === 'development' ? 'development' : environment === 'test' ? 'test' : 'production'
  const env = mergeEnvironmentLayers([{
    NODE_ENV: nodeEnv,
    HOST: '0.0.0.0',
    PORT: String(containerPort),
    HAI_SERV_SERVER_HOST: '0.0.0.0',
    HAI_SERV_SERVER_PORT: String(containerPort),
  }, Object.fromEntries(Object.entries(appEnv).filter(([name]) => !CONTAINER_ENV_KEYS.has(name))), sidecar.env, provisionEnv])
  return { env, sidecar }
}

/**
 * 生成 compose 文件内容。
 * @param options - 生成参数
 * @param options.projectName - 项目名
 * @param options.imageRef - 应用镜像引用
 * @param options.appVersion - 应用发布版本，例如 1.2.3；不改变持久化卷身份
 * @param options.hostPort - 宿主机映射端口
 * @param options.https - 可选的统一 HTTPS 入口与 Certbot 设置。
 * @param options.containerPort - 容器内端口
 * @param options.primaryService - 主运行服务角色，独立 API 为 serv，浏览器站点为 web。
 * @param options.sidecar - sidecar 规划
 * @param options.web - 同一编排中的 Web 镜像与监听端口，独立于私有应用环境
 * @param options.web.imageRef - Web 镜像引用
 * @param options.web.containerPort - Web 容器监听端口
 * @param options.mountWebConfig - 独立Vite站点是否挂载公开的目录路由配置，默认不挂载。
 * @param options.gateway - SSR/API 自建对象存储的公开 Nginx 入口；只在没有现成 Web 代理时启用。
 * @param options.requestAccessPolicy - 是否为本次更新的后端挂载只读请求策略快照。
 * @param options.nodeRuntime - Node 后端默认重读运行文件；SSR web 显式标识。
 * @param options.nodeOptions - 打包时保留的 Node 启动参数，更新需重新部署。
 * @returns compose YAML 字符串
 * @example 模块内部上下文
 * ```ts
 * const sidecar: SidecarPlan = { services: [], composeServices: {}, volumes: {}, appVolumes: [], env: {}, containerEnv: {}, dependsOn: [], secrets: [] }
 * const yaml = generateComposeFile({ projectName: 'shop', appVersion: '1.0.0', imageRef: 'shop:1.0.0-build1', hostPort: 8080, containerPort: 3000, sidecar })
 * ```
 */
export function generateComposeFile(options: {
  projectName: string
  appVersion: string
  imageRef: string
  hostPort: number
  containerPort: number
  /** 独立 API 为 serv，独立静态或 SSR 站点为 web。 */
  primaryService?: 'serv' | 'web'
  sidecar: SidecarPlan
  /** Web 公开入口；私有运行环境仅属于 API 服务。 */
  web?: { imageRef: string, containerPort: number }
  mountWebConfig?: boolean
  gateway?: boolean
  /** 本次更新的服务挂载不可变、已验证的请求策略快照。 */
  requestAccessPolicy?: boolean
  /** Node 后端每次启动重读运行文件；serv 默认开启，SSR web 由扫描结果标识。 */
  nodeRuntime?: boolean
  /** 需要保留的 Node 启动参数；变化仍需重新部署容器。 */
  nodeOptions?: string
  /** HTTPS 与 Certbot 的统一入口设置。 */
  https?: DockerSshProviderConfig['expose']['https']
}): string {
  const { projectName, imageRef, hostPort, containerPort, sidecar } = options
  const primaryService = options.primaryService ?? 'serv'
  const nodeRuntime = options.nodeRuntime ?? primaryService === 'serv'

  const app: ComposeService = {
    image: imageRef,
    labels: { 'org.opencontainers.image.version': options.appVersion },
    container_name: `hai-${projectName}-${primaryService}`,
    restart: 'unless-stopped',
    // 镜像已由 load 注入本地，禁止 compose 再从 registry 拉取
    pull_policy: 'never',
    env_file: ['.env.runtime'],
    ports: [`${hostPort}:${containerPort}`],
    networks: ['hai-app'],
  }
  if (primaryService === 'serv') {
    // 与应用相同的公开 Schema 和环境解析；重启后探针也读取当前健康路径，关闭时不请求旧路径。
    app.healthcheck = {
      test: ['CMD', 'node', '--input-type=module', '-e', 'import { core } from \'@h-ai/core\'; import { ServConfigSchema } from \'@h-ai/serv\'; try { core.init({ configDir: \'./config\' }); const { server, http } = ServConfigSchema.parse(core.config.getOrThrow(\'serv\')); if (http.health === false) process.exit(0); const response = await fetch(\'http://127.0.0.1:\' + server.port + http.health.path, { signal: AbortSignal.timeout(4000) }); process.exit(response.ok ? 0 : 1); } catch { process.exit(1); }'],
      interval: '30s',
      timeout: '5s',
      start_period: '15s',
      retries: 3,
    }
  }
  const appVolumes = [...sidecar.appVolumes]
  const appEnvironment: Record<string, string> = {}
  if (nodeRuntime) {
    delete app.env_file
    appVolumes.push('./.env.runtime:/run/hai/.env.runtime:ro', './middleware.env:/run/hai/middleware.env:ro', './runtime-env.mjs:/run/hai/runtime-env.mjs:ro')
    appEnvironment.NODE_OPTIONS = (`--import /run/hai/runtime-env.mjs${options.nodeOptions ? ` ${options.nodeOptions}` : ''}`).replaceAll('$', () => '$$')
  }
  if (options.requestAccessPolicy)
    appVolumes.push('./request-access.yml:/run/hai/request-access.yml:ro')
  if (options.web || options.gateway)
    appEnvironment.HAI_DEPLOY_PRIVATE_PROXY = '1'
  if (Object.keys(appEnvironment).length)
    app.environment = appEnvironment
  if (options.mountWebConfig)
    appVolumes.push('./web.conf:/etc/nginx/conf.d/default.conf:ro')
  if (appVolumes.length)
    app.volumes = appVolumes
  if (sidecar.dependsOn.length > 0)
    app.depends_on = Object.fromEntries(sidecar.dependsOn.map(name => [name, { condition: sidecar.composeServices[name]?.healthcheck ? 'service_healthy' : 'service_started' }]))

  const services: Record<string, ComposeService> = { [primaryService]: app, ...sidecar.composeServices }
  if (options.web) {
    delete app.ports
    services.web = {
      image: options.web.imageRef,
      labels: { 'org.opencontainers.image.version': options.appVersion },
      container_name: `hai-${projectName}-web`,
      restart: 'unless-stopped',
      pull_policy: 'never',
      ports: [`${hostPort}:${options.web.containerPort}`],
      environment: { PUBLIC_API_BASE: '' },
      healthcheck: { test: ['CMD', 'wget', '-Y', 'off', '-q', '-O', '/dev/null', `http://127.0.0.1:${options.web.containerPort}/_hai/web-health`], interval: '30s', timeout: '5s', retries: 3 },
      volumes: ['./web.conf:/etc/nginx/conf.d/default.conf:ro'],
      depends_on: sidecar.services.includes('storage') ? ['serv', 'storage'] : ['serv'],
      networks: ['hai-app'],
    }
  }
  if (options.gateway) {
    delete app.ports
    services.gateway = {
      image: IMAGES.nginx,
      container_name: `hai-${projectName}-gateway`,
      restart: 'unless-stopped',
      ports: [`${hostPort}:8080`],
      healthcheck: { test: ['CMD', 'wget', '-Y', 'off', '-q', '-O', '/dev/null', 'http://127.0.0.1:8080/_hai/gateway-health'], interval: '30s', timeout: '5s', retries: 3 },
      volumes: ['./web.conf:/etc/nginx/conf.d/default.conf:ro'],
      depends_on: [primaryService, ...(sidecar.services.includes('storage') ? ['storage'] : [])],
      networks: ['hai-app'],
    }
  }
  if (options.https) {
    const proxy = services[options.gateway ? 'gateway' : options.web ? 'web' : primaryService]!
    const https = options.https
    const httpPort = options.gateway ? 8080 : options.web?.containerPort ?? containerPort
    proxy.ports = [...proxy.ports as string[], `${https.port}:${httpPort === 8443 ? 8444 : 8443}`]
    const certificates = https.type === 'files' ? './tls' : `../../https/certificates/${https.domain}`
    proxy.volumes = [
      ...proxy.volumes as string[],
      `${certificates}:/etc/nginx/tls:ro`,
      './https-start.sh:/run/hai/https-start.sh:ro',
      ...(https.type === 'letsencrypt' ? ['../../https/webroot:/var/www/certbot:ro'] : []),
    ]
    proxy.entrypoint = ['sh', '/run/hai/https-start.sh']
    if (https.type === 'letsencrypt') {
      services.certbot = {
        image: CERTBOT_IMAGE,
        restart: 'unless-stopped',
        entrypoint: ['sh', '/run/hai/renew-https.sh'],
        volumes: [
          '../../https/acme:/etc/letsencrypt',
          '../../https/webroot:/var/www/certbot',
          `../../https/certificates/${https.domain}:/output`,
          './renew-https.sh:/run/hai/renew-https.sh:ro',
        ],
        networks: ['hai-app'],
      }
    }
  }
  const compose: Record<string, unknown> = {
    'x-hai-version': options.appVersion,
    services,
    'networks': {
      'hai-app': {},
    },
  }
  if (Object.keys(sidecar.volumes).length > 0)
    compose.volumes = sidecar.volumes

  for (const service of Object.values(services))
    service.pull_policy = 'never'
  return stringify(compose, { aliasDuplicateObjects: false })
}

/**
 * 生成同源 Web/API 的 Nginx 配置，保留运行时配置及 SPA 页面刷新。
 * API 上限由 @h-ai/crypto 的同一明文容量推导密文预算；
 * 关闭请求缓冲，让应用在读取过程中执行握手、公钥和正文的更细预算。
 * @param port - API 容器监听端口
 * @param apiPrefix - 应用实际 API 前缀，不允许向 Nginx 配置注入指令
 * @param options - Web 监听端口和双向业务明文 UTF-8 字节上限，缺省使用 crypto 默认值
 * @param options.webPort - Web 容器监听端口，默认 8080。
 * @param options.maxPlaintextBytes - 业务明文 UTF-8 字节上限。
 * @param options.webBasePath - 无末尾斜杠的Web挂载目录，缺省或空字符串为域名根目录。
 * @param options.storageBucket - 自建私有 S3 桶，配置后对象请求由 Nginx 直达 storage。
 * @param options.storageBasePath - 对象入口目录，转发前移除；空字符串保持根桶路径。
 * @param options.trustedEdgeProxies - Nginx 前方显式可信的负载均衡 IP/CIDR，默认不信任上游头。
 * @param options.backendPaths - 后端实际启用的健康、就绪及文档精确路径，认证仍由后端执行。
 * @returns 仅含公开路由的 Nginx 配置
 * @example 模块内部上下文
 * ```ts
 * const nginx = generateWebProxyConfig(3000, '/api', { webPort: 8080 }) // Web 将同源 /api 转发至 serv 服务。
 * ```
 */
export function generateWebProxyConfig(port: number, apiPrefix: string, options: { webPort?: number, maxPlaintextBytes?: number, webBasePath?: string, backendPaths?: string[], storageBucket?: string, storageBasePath?: string, trustedEdgeProxies?: string[] } = {}): string {
  const bodyLimits = resolveTransportBodyLimits(options.maxPlaintextBytes)
  const webPort = options.webPort ?? 8080
  const webBasePath = options.webBasePath ?? ''
  const apiPath = apiPrefix.replace(/\/+$/, '')
  const backendPaths = [...new Set(options.backendPaths ?? ['/health'])]
  if (!/^\/[\w/-]+$/.test(apiPrefix) || ![port, webPort].every(value => Number.isInteger(value) && value >= 1 && value <= 65535)
    || backendPaths.some(path => !/^\/[\w./-]*$/.test(path) || path.startsWith('//') || path.split('/').some(part => part === '.' || part === '..') || path === `${webBasePath}/runtime-config.js` || path === '/_hai/web-health')
    || (webBasePath && (backendPaths.includes(webBasePath) || webBasePath === apiPath || webBasePath.startsWith(`${apiPath}/`)))) {
    throw new Error('Invalid web proxy target')
  }
  const webLocation = renderWebLocation(webBasePath)
  const storageLocation = options.storageBucket ? renderStorageLocation(options.storageBucket, [apiPath, ...backendPaths, ...(options.storageBasePath ? [`${webBasePath}/_app`, `${webBasePath}/assets`, `${webBasePath}/runtime-config.js`] : [webBasePath])], options.storageBasePath) : ''
  const backendLocations = backendPaths.map(path => `  location = ${path} {
    proxy_pass http://serv:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
  }
`).join('')
  return `${options.storageBucket ? renderStorageUpstream(options.storageBucket, options.storageBasePath) : ''}server {
  listen ${webPort};
  server_name _;
${renderTrustedEdgeProxies(options.trustedEdgeProxies)}  root /usr/share/nginx/html;
  large_client_header_buffers 4 32k;
${storageLocation}${webLocation}  location = ${webBasePath}/runtime-config.js {
    add_header Cache-Control "no-store";
    default_type application/javascript;
    return 200 'globalThis.__HAI_PUBLIC_CONFIG__={apiBase:globalThis.location.origin+"${apiPrefix}"};';
  }
  location = /_hai/web-health {
    access_log off;
    return 200 'ok';
  }
${backendLocations}  location ${apiPrefix.replace(/\/$/, '')}/ {
    client_max_body_size ${bodyLimits.encryptedPayloadBytes};
    proxy_pass http://serv:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_buffer_size 32k;
    proxy_buffers 8 32k;
  }
}
`
}

/**
 * 生成私有对象直连路由；不重写签名所绑定的 Host、原始 URI 和查询，不把大文件送进应用。
 * @param bucket - 自建桶名；仅接受可安全用于 S3 路径与 Nginx location 的 DNS 桶名。
 * @param reservedPaths - 应用目录和 API 前缀，桶路径不能遮蔽其中任一路由。
 * @param storageBasePath - 已校验的公开入口目录，空字符串保持根桶路径。
 * @returns 不含凭据、不记录签名查询的 location 片段。
 * @example 模块内部上下文
 * ```ts
 * const route = renderStorageLocation('uploads', ['/api/v1', '/portal'])
 * void route
 * ```
 */
function renderStorageLocation(bucket: string, reservedPaths: string[], storageBasePath = ''): string {
  // 与网站目录共用安全路径校验；入口可位于网站目录内，但不能覆盖 API、资源或健康接口。
  renderWebLocation(storageBasePath)
  const path = `${storageBasePath}/${bucket}`
  const reserved = ['/health', '/_hai', ...reservedPaths].filter(Boolean)
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..')
    || ['health', '_hai'].includes(bucket)
    || reserved.some(item => item === path || item.startsWith(`${path}/`) || path.startsWith(`${item}/`)
      || (storageBasePath && (item === storageBasePath || item.startsWith(`${storageBasePath}/`) || storageBasePath.startsWith(`${item}/`))))) {
    throw new Error('Storage bucket conflicts with application routes or is not a valid DNS bucket name')
  }
  return `  location ^~ ${path}/ {
    # 预签名 URL 属于短期访问凭据，不写入代理访问或错误日志。
    access_log off;
    error_log /dev/null;
    # 对象可能含不可信 HTML；同源下载也不能取得应用脚本权限或泄露签名来源。
    add_header Content-Security-Policy "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'" always;
    proxy_hide_header X-Content-Type-Options;
    add_header X-Content-Type-Options nosniff always;
    proxy_hide_header Referrer-Policy;
    add_header Referrer-Policy no-referrer always;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "private, no-store" always;
    limit_except GET PUT OPTIONS { deny all; }
    client_max_body_size 0;
${storageBasePath
  ? `    # map 保留原始 URI 与查询；不在 location 内创建改变代理继承的 if 配置。
    proxy_pass http://hai_storage_proxy$hai_storage_uri;`
  : '    proxy_pass http://storage:9000;'}
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Connection "";
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }
`
}

/**
 * 显式 upstream 允许带原始 URI 变量转发，避免依赖不同容器引擎的运行时 DNS resolver。
 * @param bucket - 已由对象路由校验的自建桶名。
 * @param storageBasePath - 安全入口目录，空字符串无需 URI 映射。
 * @returns 位于 http 上下文的 upstream 与 map，保留编码和查询并移除入口目录。
 * @example 模块内部上下文
 * ```ts
 * const config = renderStorageUpstream('business-files', '/delivery/files')
 * void config
 * ```
 */
function renderStorageUpstream(bucket: string, storageBasePath = ''): string {
  if (!storageBasePath)
    return ''
  const path = `${storageBasePath}/${bucket}`.replaceAll('.', '\\\\.')
  return `upstream hai_storage_proxy { server storage:9000; }
map $request_uri $hai_storage_uri {
  default $request_uri;
  "~^${path}(/.*)$" /${bucket}$1;
}
`
}

/**
 * 为独立 API 或 SvelteKit SSR 生成对象存储网关，应用路径（含部署目录）原样转发。
 * @param options - 内部服务、端口、桶、保留路径、transport 容量和上游代理 IP/CIDR。
 * @param options.primaryService - 实际处理请求的应用服务。
 * @param options.port - 应用容器内端口。
 * @param options.bucket - 私有 S3 桶名。
 * @param options.storageBasePath - publicEndpoint 中的代理目录，不包含桶名。
 * @param options.reservedPaths - 不能与桶路由重叠的应用路径。
 * @param options.maxPlaintextBytes - 应用 transport 明文预算。
 * @param options.trustedEdgeProxies - Nginx 上游可信负载均衡 IP/CIDR。
 * @returns 监听 8080 的公开 Nginx 配置，不含应用或对象存储凭据。
 * @example 模块内部上下文
 * ```ts
 * const config = generateApplicationProxyConfig({ primaryService: 'web', port: 3000, bucket: 'uploads', reservedPaths: ['/portal'] })
 * void config
 * ```
 */
export function generateApplicationProxyConfig(options: { primaryService: 'serv' | 'web', port: number, bucket?: string, reservedPaths: string[], storageBasePath?: string, maxPlaintextBytes?: number, trustedEdgeProxies?: string[] }): string {
  const { primaryService, port, bucket, reservedPaths, maxPlaintextBytes } = options
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid application proxy target')
  const bodyLimits = resolveTransportBodyLimits(maxPlaintextBytes)
  return `${bucket ? renderStorageUpstream(bucket, options.storageBasePath) : ''}server {
  listen 8080;
  server_name _;
${renderTrustedEdgeProxies(options.trustedEdgeProxies)}  large_client_header_buffers 4 32k;
${bucket ? renderStorageLocation(bucket, reservedPaths, options.storageBasePath) : ''}  location = /_hai/gateway-health {
    access_log off;
    return 200 'ok';
  }
  location / {
    client_max_body_size ${bodyLimits.encryptedPayloadBytes};
    proxy_pass http://${primaryService}:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_buffer_size 32k;
    proxy_buffers 8 32k;
  }
}
`
}

/** 上游 LB 只接受显式 IP/CIDR；随后用 Nginx 已验证的 remote_addr 重写转发头。 */
function renderTrustedEdgeProxies(entries: string[] = []): string {
  if (!TrustedProxiesSchema.safeParse(entries).success)
    throw new Error('Invalid trusted edge proxy address')
  if (!entries.length)
    return ''
  return `${entries.map(entry => `  set_real_ip_from ${entry};`).join('\n')}\n  real_ip_header X-Forwarded-For;\n  real_ip_recursive on;\n`
}

/**
 * 目录路由共享同一校验与静态回退；文件命中后直接输出，避免重定向到域名根目录。
 * @param webBasePath - 无末尾斜杠的目录，空字符串为根目录。
 * @returns 包含目录校验、无末尾斜杠跳转和静态回退的 location 配置。
 * @example 模块内部上下文
 * ```ts
 * const locations = renderWebLocation('/portal')
 * void locations
 * ```
 */
function renderWebLocation(webBasePath: string): string {
  if (webBasePath && (!/^\/[\w.-]+(?:\/[\w.-]+)*$/.test(webBasePath) || webBasePath.split('/').some(segment => segment === '.' || segment === '..') || ['/health', '/_hai/web-health'].includes(webBasePath)))
    throw new Error('Invalid web base path')
  return webBasePath
    ? `  absolute_redirect off;
  location = ${webBasePath} {
    return 308 ${webBasePath}/$is_args$args;
  }
  location ${webBasePath}/ {
    rewrite ^${webBasePath.replaceAll('.', '\\.').replaceAll('-', '\\-')}/(.*)$ /$1 break;
    try_files $uri/index.html $uri /index.html =404;
  }
  location / { return 404; }
`
    : `  location / {
    try_files $uri $uri/ /index.html;
  }
`
}

/**
 * 独立Vite站点复用目录路由，公开运行配置仍由已有启动脚本生成，保留外部API地址与品牌字段。
 * @param port - Web容器实际监听端口。
 * @param webBasePath - 已声明的Web挂载目录；无末尾斜杠，空字符串表示根目录。
 * @returns 只含静态页面、公开运行配置和健康入口的Nginx配置。
 * @example 模块内部上下文
 * ```ts
 * const config = generateStaticWebConfig(8080, '/portal')
 * void config
 * ```
 */
export function generateStaticWebConfig(port: number, webBasePath: string): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid web proxy target')
  return `server {
  listen ${port};
  server_name _;
  root /usr/share/nginx/html;
${renderWebLocation(webBasePath)}  location = ${webBasePath}/runtime-config.js {
    alias /tmp/hai-runtime-config/runtime-config.js;
    add_header Cache-Control "no-store";
    default_type application/javascript;
  }
  location = /health {
    access_log off;
    return 200 'ok';
  }
}
`
}

/**
 * 将环境变量对象序列化为 .env.runtime 内容（每行 KEY=VALUE）。
 * 编码 dotenv 值，不进行脱敏；含密钥时只能写入受保护的运行环境文件。
 * @param env - 要序列化的运行变量，可能包含秘密。
 * @returns 保留字面量值且正确转义的 dotenv 文本，不进行脱敏。
 * @example 模块内部上下文
 * ```ts
 * const content = serializeEnvFile({ NODE_ENV: 'production', HAI_CORE_NAME: 'Shop app' })
 * ```
 */
export function serializeEnvFile(env: Record<string, string>): string {
  return `${Object.entries(env)
    .map(([key, value]) => {
      let literal = value
      if (/[\s#$'"]/.test(value)) {
        if (value.startsWith('{') || value.startsWith('['))
          literal = `'${value.replaceAll('\'', '\\u0027')}'`
        else if (!value.includes('\''))
          literal = `'${value}'`
        else
          literal = JSON.stringify(value).replaceAll('$', '$$')
      }
      return `${key}=${literal}`
    })
    .join('\n')}\n`
}
