/**
 * @h-ai/deploy — 容器编排文件生成
 *
 * 根据应用扫描结果生成 compose 文件与运行期环境：按需为 db/cache/storage
 * 追加自建 sidecar 服务，并注入对应的 HAI_DB / HAI_CACHE / HAI_STORAGE 覆盖变量。
 * 敏感值仅写入 .env.runtime，禁止进入 compose 文件。
 * @module deploy-container-compose
 */

import type { ScanResult, ServiceType } from '../deploy-types.js'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stringify } from 'yaml'

/** sidecar 镜像固定版本，避免 `:latest` 漂移导致行为变化。 */
const IMAGES = {
  postgres: 'postgres:16-alpine',
  mysql: 'mysql:8.4',
  redis: 'redis:7-alpine',
  minio: 'minio/minio:RELEASE.2025-09-07T16-13-09Z',
  mc: 'minio/mc:RELEASE.2025-08-13T08-35-41Z',
  qdrant: 'qdrant/qdrant:v1.12.4',
  pgvector: 'pgvector/pgvector:pg17',
  chroma: 'chromadb/chroma:0.5.23',
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

/** MinIO(S3) sidecar + 一次性 bucket 初始化。 */
function planMinioStorage(plan: SidecarPlan, projectName: string, password: string, net: string[]): void {
  plan.services.push('storage')
  plan.dependsOn.push('storage')
  plan.composeServices.storage = {
    image: IMAGES.minio,
    container_name: `hai-${projectName}-storage`,
    restart: 'unless-stopped',
    command: ['server', '/data'],
    env_file: ['.env.runtime'],
    volumes: [`${projectName}-storage-data:/data`],
    networks: net,
  }
  plan.composeServices['storage-init'] = {
    image: IMAGES.mc,
    depends_on: ['storage'],
    env_file: ['.env.runtime'],
    entrypoint: [
      'sh',
      '-c',
      'until mc alias set s3 http://storage:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; do sleep 1; done; mc mb -p s3/hai; exit 0',
    ],
    networks: net,
  }
  plan.volumes[`${projectName}-storage-data`] = null
  plan.env.MINIO_ROOT_USER = 'hai'
  plan.env.MINIO_ROOT_PASSWORD = password
  plan.env.HAI_STORAGE = JSON.stringify({
    type: 's3',
    endpoint: 'http://storage:9000',
    bucket: 'hai',
    region: 'us-east-1',
    accessKeyId: 'hai',
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
  const secrets = resolveSidecarSecrets(appDir, projectName)
  const net = ['hai-app']
  const backends = scan.serviceBackends

  for (const service of scan.requiredServices) {
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
      planRedisCache(plan, projectName, net)
    }
    else if (service === 'storage' && !provisionEnv.HAI_STORAGE) {
      planMinioStorage(plan, projectName, secrets.storagePassword, net)
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
): RuntimeEnvPlan {
  const sidecar = planSidecars(appDir, projectName, scan, provisionEnv)
  const env: Record<string, string> = {
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    PORT: String(containerPort),
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
 * @returns compose YAML 字符串
 */
export function generateComposeFile(options: {
  projectName: string
  imageRef: string
  hostPort: number
  containerPort: number
  sidecar: SidecarPlan
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

  const compose: Record<string, unknown> = {
    services: {
      app,
      ...sidecar.composeServices,
    },
    networks: {
      'hai-app': { name: `hai-${projectName}` },
    },
  }
  if (Object.keys(sidecar.volumes).length > 0)
    compose.volumes = sidecar.volumes

  return stringify(compose)
}

/** 将环境变量对象序列化为 .env.runtime 内容（每行 KEY=VALUE）。 */
export function serializeEnvFile(env: Record<string, string>): string {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`
}

/**
 * 生成兜底 Dockerfile 的伴随 `.dockerignore`。
 *
 * 仅排除重产物，保留全部源码（monorepo 以 workspace 根为上下文时需包含 apps/packages 源码，
 * 覆盖仓库根可能存在的排除 apps 的 `.dockerignore`）。
 *
 * @returns dockerignore 内容
 */
export function generateDockerignore(): string {
  return `**/node_modules
**/dist
**/build
**/.turbo
**/.svelte-kit
**/coverage
**/test-results
**/playwright-report
**/.hai/deploy
.git
`
}

/**
 * 生成兜底 Dockerfile（应用未自带 Dockerfile 时使用）。
 *
 * 面向 SvelteKit + @sveltejs/adapter-node。`COPY .` 复制构建上下文（单应用为 appDir、
 * monorepo 为 workspace 根，由 Provider 选择），`pnpm --filter <包名>` 只构建目标应用。
 *
 * @param packageName - 应用完整包名（用于 pnpm --filter）
 * @param containerPort - 容器监听端口
 * @returns Dockerfile 内容
 */
export function generateFallbackDockerfile(packageName: string, containerPort: number): string {
  return `# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter ${packageName} build
RUN pnpm --filter ${packageName} --prod deploy /prod/app

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=${containerPort}
WORKDIR /app
COPY --from=build --chown=node:node /prod/app ./
USER node
EXPOSE ${containerPort}
CMD ["node", "build"]
`
}
