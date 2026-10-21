/**
 * @h-ai/deploy — 容器编排文件生成
 *
 * 根据应用扫描结果生成 compose 文件与运行期环境：按需为 db/cache/storage
 * 追加自建 sidecar 服务，并注入对应的 HAI_DB / HAI_CACHE / HAI_STORAGE 覆盖变量。
 * 敏感值仅写入 .env.runtime，禁止进入 compose 文件。
 * @module deploy-container-compose
 */

import type { DeployAppOptions, ScanResult, ServiceType } from '../deploy-types.js'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse, stringify } from 'yaml'
import { usesDefaultMiddleware } from '../deploy-functions.js'

/** sidecar 镜像固定版本，避免 `:latest` 漂移导致行为变化。 */
const IMAGES = {
  postgres: 'postgres:16-alpine',
  mysql: 'mysql:8.4',
  redis: 'redis:7-alpine',
  rustfs: 'ghcr.io/rustfs/rustfs:1.0.1',
  minio: 'ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z',
  qdrant: 'qdrant/qdrant:v1.12.4',
  pgvector: 'pgvector/pgvector:pg17',
  chroma: 'chromadb/chroma:1.5.5',
  ldap: 'docker.io/osixia/openldap:1.5.0',
  smtp: 'axllent/mailpit:v1.27.4',
} as const

/** compose 服务定义（结构化对象，交由 yaml 序列化）。 */
type ComposeService = Record<string, unknown>

/** sidecar 规划结果。 */
export interface SidecarPlan {
  /** 实际启用的自建服务 */
  services: ServiceType[]
  /** compose services 片段（不含 app） */
  composeServices: Record<string, ComposeService>
  /** 命名卷 */
  volumes: Record<string, unknown>
  /** 挂载到 app 容器的卷（如 sqlite/lancedb 的本地数据目录持久化） */
  appVolumes: string[]
  /** 追加到 .env.runtime 的环境变量（含 HAI_* 覆盖与 sidecar 凭据） */
  env: Record<string, string>
  /** app 服务的 depends_on 列表 */
  dependsOn: string[]
  /** 需要在日志中脱敏的敏感值 */
  secrets: string[]
}

/** 运行期环境构建结果。 */
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
 * 读取或创建稳定的 sidecar 凭据。
 *
 * 为保证重复部署的幂等性（密码不变，避免已存在数据卷认证失败），
 * 凭据持久化到本地 gitignore 的 `.hai/deploy/runtime/<project>.secrets.json`。
 *
 * @param appDir - 应用根目录
 * @param projectName - 项目名
 * @returns 稳定的凭据键值对
 */
function resolveSidecarSecrets(appDir: string, projectName: string): Record<string, string> {
  const secretFile = join(appDir, '.hai', 'deploy', 'runtime', `${projectName}.secrets.json`)
  if (existsSync(secretFile)) {
    try {
      return JSON.parse(readFileSync(secretFile, 'utf-8')) as Record<string, string>
    }
    catch {
      // 损坏则重建
    }
  }
  const secrets = {
    dbPassword: generatePassword(),
    storagePassword: generatePassword(),
    ldapPassword: generatePassword(),
  }
  mkdirSync(dirname(secretFile), { recursive: true })
  writeFileSync(secretFile, JSON.stringify(secrets), { mode: 0o600 })
  return secrets
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
    env_file: ['.env.runtime'],
    volumes: [`${projectName}-db-data:/var/lib/postgresql/data`],
    networks: net,
  }
  plan.volumes[`${projectName}-db-data`] = null
  plan.env.POSTGRES_USER = 'hai'
  plan.env.POSTGRES_PASSWORD = password
  plan.env.POSTGRES_DB = 'hai'
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
    env_file: ['.env.runtime'],
    volumes: [`${projectName}-db-data:/var/lib/mysql`],
    networks: net,
  }
  plan.volumes[`${projectName}-db-data`] = null
  plan.env.MYSQL_ROOT_PASSWORD = password
  plan.env.MYSQL_DATABASE = 'hai'
  plan.env.MYSQL_USER = 'hai'
  plan.env.MYSQL_PASSWORD = password
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
    networks: net,
  }
  plan.env.HAI_CACHE = JSON.stringify({ type: 'redis', url: 'redis://cache:6379' })
}

/** S3 协议与服务实现分离；RustFS/MinIO 使用相同应用契约及幂等 bucket 初始化。 */
function planS3Storage(plan: SidecarPlan, projectName: string, password: string, net: string[], engine: 'rustfs' | 'minio'): void {
  plan.services.push('storage')
  plan.dependsOn.push('storage')
  plan.composeServices.storage = {
    image: IMAGES[engine],
    container_name: `hai-${projectName}-storage`,
    restart: 'unless-stopped',
    ...(engine === 'minio' ? { command: ['server', '/data'] } : {}),
    env_file: ['.env.runtime'],
    volumes: [`${projectName}-storage-data:/data`],
    networks: net,
  }
  plan.composeServices['storage-init'] = {
    depends_on: ['storage'],
    env_file: ['.env.runtime'],
    entrypoint: [
      'node',
      '--input-type=module',
      '-e',
      // 复用应用 @h-ai/storage 已依赖的 SDK；不额外拉取失效的 mc 镜像，不把密钥拼进命令。
      `import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
const config = JSON.parse(process.env.HAI_STORAGE);
const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
let ready = false;
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    try { await client.send(new HeadBucketCommand({ Bucket: config.bucket })); }
    catch (error) {
      if (error.$$metadata?.httpStatusCode !== 404) throw error;
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    }
    ready = true; break;
  } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
}
client.destroy();
if (!ready) throw new Error('S3 bucket initialization failed');`,
    ],
    networks: net,
  }
  plan.volumes[`${projectName}-storage-data`] = null
  if (engine === 'rustfs') {
    Object.assign(plan.env, { RUSTFS_ACCESS_KEY: 'hai-storage', RUSTFS_SECRET_KEY: password, RUSTFS_ADDRESS: '0.0.0.0:9000', RUSTFS_VOLUMES: '/data', RUSTFS_CONSOLE_ENABLE: 'false' })
  }
  else {
    Object.assign(plan.env, { MINIO_ROOT_USER: 'hai-storage', MINIO_ROOT_PASSWORD: password })
  }
  plan.env.HAI_STORAGE = JSON.stringify({
    type: 's3',
    endpoint: 'http://storage:9000',
    bucket: 'hai',
    region: 'us-east-1',
    accessKeyId: 'hai-storage',
    secretAccessKey: password,
    forcePathStyle: true,
  })
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
    env_file: ['.env.runtime'],
    volumes: [`${projectName}-vecdb-data:/var/lib/postgresql/data`],
    networks: net,
  }
  plan.volumes[`${projectName}-vecdb-data`] = null
  // 与 postgres db sidecar 共用 POSTGRES_* 凭据（不同实例、不同卷，值一致即可）
  plan.env.POSTGRES_USER = 'hai'
  plan.env.POSTGRES_PASSWORD = password
  plan.env.POSTGRES_DB = 'hai'
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
 * 规划自建 sidecar 服务。
 *
 * 仅为 scan.requiredServices 中、且 Provisioner 未提供对应 HAI_* 变量的服务追加 sidecar；
 * db 与 vecdb 按扫描到的后端类型（postgresql/mysql/sqlite、qdrant/pgvector/chroma/lancedb）生成匹配实现。
 *
 * @param appDir - 应用根目录
 * @param projectName - 项目名
 * @param scan - 扫描结果
 * @param provisionEnv - Provisioner 输出的环境变量
 * @returns sidecar 规划
 */
export function planSidecars(
  appDir: string,
  projectName: string,
  scan: ScanResult,
  provisionEnv: Record<string, string>,
  options?: DeployAppOptions,
  s3Engine: 'rustfs' | 'minio' = 'rustfs',
): SidecarPlan {
  const plan: SidecarPlan = {
    services: [],
    composeServices: {},
    volumes: {},
    appVolumes: [],
    env: {},
    dependsOn: [],
    secrets: [],
  }
  // 全部保持不变时，连默认中间件凭据文件也不读取或创建。
  if (!scan.requiredServices.some(service => usesDefaultMiddleware(scan, service, options)))
    return plan
  const secrets = resolveSidecarSecrets(appDir, projectName)
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
        planS3Storage(plan, projectName, secrets.storagePassword, net, s3Engine)
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
      plan.composeServices.ldap = { image: IMAGES.ldap, restart: 'unless-stopped', env_file: ['.env.runtime'], networks: net, volumes: [`${projectName}-ldap-data:/var/lib/ldap`, `${projectName}-ldap-config:/etc/ldap/slapd.d`] }
      plan.volumes[`${projectName}-ldap-data`] = null
      plan.volumes[`${projectName}-ldap-config`] = null
      Object.assign(plan.env, { LDAP_DOMAIN: 'example.org', LDAP_ORGANISATION: 'HAI', LDAP_ADMIN_PASSWORD: password, LDAP_TLS: 'false', HAI_IAM_LOGIN_LDAP: 'true', HAI_IAM_LDAP: JSON.stringify({ url: 'ldap://ldap:389', bindDn: 'cn=admin,dc=example,dc=org', bindPassword: password, searchBase: 'dc=example,dc=org' }) })
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
 * 合并顺序（后者覆盖前者）：框架默认 < sidecar 自建 < Provisioner 输出。
 *
 * @param appDir - 应用根目录
 * @param projectName - 项目名
 * @param scan - 扫描结果
 * @param provisionEnv - Provisioner 输出环境变量
 * @param containerPort - 容器内监听端口
 * @returns 运行期环境与 sidecar 规划
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
  const env: Record<string, string> = {
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    PORT: String(containerPort),
    HAI_SERV_SERVER_HOST: '0.0.0.0',
    HAI_SERV_SERVER_PORT: String(containerPort),
    ...appEnv,
    ...sidecar.env,
    ...provisionEnv,
  }
  return { env, sidecar }
}

/**
 * 生成 compose 文件内容。
 *
 * @param options - 生成参数
 * @param options.projectName - 项目名
 * @param options.imageRef - 应用镜像引用
 * @param options.hostPort - 宿主机映射端口
 * @param options.containerPort - 容器内端口
 * @param options.sidecar - sidecar 规划
 * @param options.previousCompose - 需要保留服务时读取的上次编排
 * @param options.serviceModes - 各中间件的处理选择
 * @param options.web - 同一编排中的 Web 镜像与监听端口，独立于私有应用环境
 * @param options.web.imageRef - Web 镜像引用
 * @param options.web.containerPort - Web 容器监听端口
 * @returns compose YAML 字符串
 */
export function generateComposeFile(options: {
  projectName: string
  imageRef: string
  hostPort: number
  containerPort: number
  sidecar: SidecarPlan
  /** 上次编排；保持不变的服务继续保留其定义与持久化卷。 */
  previousCompose?: string
  /** 各中间件的处理选择。 */
  serviceModes?: DeployAppOptions['serviceModes']
  /** Web 公开入口；私有运行环境仅属于 API 服务。 */
  web?: { imageRef: string, containerPort: number }
}): string {
  const { projectName, imageRef, hostPort, containerPort, sidecar } = options

  const app: ComposeService = {
    image: imageRef,
    container_name: `hai-${projectName}-app`,
    restart: 'unless-stopped',
    // 镜像已由 load 注入本地，禁止 compose 再从 registry 拉取
    pull_policy: 'never',
    env_file: ['.env.runtime'],
    ports: [`${hostPort}:${containerPort}`],
    networks: ['hai-app'],
  }
  if (sidecar.appVolumes.length > 0)
    app.volumes = sidecar.appVolumes
  if (sidecar.dependsOn.length > 0)
    app.depends_on = sidecar.dependsOn

  const services: Record<string, ComposeService> = { app, ...sidecar.composeServices }
  if (options.web) {
    delete app.ports
    services.web = {
      image: options.web.imageRef,
      container_name: `hai-${projectName}-web`,
      restart: 'unless-stopped',
      pull_policy: 'never',
      ports: [`${hostPort}:${options.web.containerPort}`],
      environment: { PUBLIC_API_BASE: '' },
      healthcheck: { test: ['CMD', 'wget', '-Y', 'off', '-q', '-O', '/dev/null', `http://127.0.0.1:${options.web.containerPort}/_hai/web-health`], interval: '30s', timeout: '5s', retries: 3 },
      volumes: ['./web.conf:/etc/nginx/conf.d/default.conf:ro'],
      depends_on: ['app'],
      networks: ['hai-app'],
    }
  }
  if (services['storage-init'])
    services['storage-init'] = { ...services['storage-init'], image: imageRef }
  const compose: Record<string, unknown> = {
    services,
    networks: {
      'hai-app': { name: `hai-${projectName}` },
    },
  }
  if (Object.keys(sidecar.volumes).length > 0)
    compose.volumes = sidecar.volumes

  if (options.previousCompose && options.serviceModes) {
    const previous = parse(options.previousCompose) as { services?: Record<string, ComposeService>, volumes?: Record<string, unknown> }
    for (const [service, mode] of Object.entries(options.serviceModes)) {
      if (mode !== 'keep')
        continue
      for (const name of [service, `${service}-init`]) {
        if (previous.services?.[name]) {
          services[name] = previous.services[name]
          app.depends_on = [...new Set([...(app.depends_on as string[] | undefined ?? []), service])]
        }
      }
    }
    const previousMounts = previous.services?.app?.volumes
    if (Array.isArray(previousMounts) && Object.values(options.serviceModes).includes('keep'))
      app.volumes = [...new Set([...(app.volumes as string[] | undefined ?? []), ...previousMounts])]
    // 保留已有卷定义不会创建/删除容器或清空卷，避免 keep 路径丢失挂载。
    compose.volumes = { ...previous.volumes, ...sidecar.volumes }
  }

  // S3 服务启动不等于桶已创建；初始化失败必须阻止应用启动，不能只依靠 HTTP 健康检查。
  if (services['storage-init']) {
    app.depends_on = {
      ...Object.fromEntries((app.depends_on as string[] | undefined ?? []).map(name => [name, { condition: 'service_started' }])),
      'storage-init': { condition: 'service_completed_successfully' },
    }
  }

  for (const service of Object.values(services))
    service.pull_policy = 'never'
  return stringify(compose)
}

/**
 * 生成同源 Web/API 的 Nginx 配置，保留运行时配置及 SPA 页面刷新。
 * @param port - API 容器监听端口
 * @param apiPrefix - 应用实际 API 前缀，不允许向 Nginx 配置注入指令
 * @param webPort - Web 容器监听端口
 * @returns 仅含公开路由的 Nginx 配置
 * @example `generateWebProxyConfig(3000, '/api/v1')`
 */
export function generateWebProxyConfig(port: number, apiPrefix: string, webPort = 8080): string {
  if (!/^\/[\w/-]+$/.test(apiPrefix) || ![port, webPort].every(value => Number.isInteger(value) && value >= 1 && value <= 65535))
    throw new Error('Invalid web proxy target')
  return `server {
  listen ${webPort};
  server_name _;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location = /runtime-config.js {
    add_header Cache-Control "no-store";
    default_type application/javascript;
    return 200 'globalThis.__HAI_PUBLIC_CONFIG__={apiBase:globalThis.location.origin+"${apiPrefix}"};';
  }
  location = /_hai/web-health {
    access_log off;
    return 200 'ok';
  }
  location = /health {
    proxy_pass http://app:${port};
    proxy_set_header Host $http_host;
  }
  location ${apiPrefix.replace(/\/$/, '')}/ {
    proxy_pass http://app:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
  }
}
`
}

/** 将环境变量对象序列化为 .env.runtime 内容（每行 KEY=VALUE）。 */
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
