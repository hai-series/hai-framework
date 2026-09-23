/**
 * @h-ai/deploy — 应用扫描器
 *
 * 扫描应用目录，检测框架类型、模块依赖和所需基础设施。
 * @module deploy-scanner
 */

import type { HaiResult } from '@h-ai/core'
import type { ScanResult, ServiceType } from './deploy-types.js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { parse } from 'yaml'
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'scanner' })

// ─── 内部工具 ───

/**
 * 安全读取并解析 YAML 文件
 *
 * @param filePath - YAML 文件路径
 * @returns 解析结果，文件不存在或解析失败时返回 null
 */
function readYaml(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) {
    return null
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed = parse(content)
    if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
      return null
    }
    return parsed as Record<string, unknown>
  }
  catch {
    return null
  }
}

/**
 * 安全读取 JSON 文件
 *
 * @param filePath - JSON 文件路径
 * @returns 解析结果，文件不存在或解析失败时返回 null
 */
function readJson(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) {
    return null
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  }
  catch {
    return null
  }
}

/**
 * 检测 package.json 的 dependencies + devDependencies 中是否包含指定包
 *
 * @param pkg - package.json 内容
 * @param name - 包名
 */
function hasDependency(pkg: Record<string, unknown>, name: string): boolean {
  const deps = pkg.dependencies as Record<string, string> | undefined
  const devDeps = pkg.devDependencies as Record<string, string> | undefined
  return (deps !== undefined && name in deps) || (devDeps !== undefined && name in devDeps)
}

/**
 * 扫描 config/ 目录，推断所需基础设施服务及各自后端类型
 *
 * @param configDir - 配置目录路径
 * @returns 所需服务列表与后端类型映射
 */
function detectRequiredServices(configDir: string): { services: ServiceType[], backends: Partial<Record<ServiceType, string>> } {
  const services: ServiceType[] = []
  const backends: Partial<Record<ServiceType, string>> = {}

  if (!existsSync(configDir)) {
    return { services, backends }
  }

  const files = readdirSync(configDir)

  // 数据库：记录实际后端（postgresql / mysql / sqlite）以生成匹配 sidecar
  const dbFile = files.find(f => f.startsWith('_db.'))
  if (dbFile) {
    const dbConfig = readYaml(join(configDir, dbFile))
    if (dbConfig !== null) {
      services.push('db')
      backends.db = (dbConfig.type as string | undefined) ?? 'postgresql'
    }
  }

  // 缓存：仅 redis 需要外部服务，memory 模式无需 sidecar
  const cacheFile = files.find(f => f.startsWith('_cache.'))
  if (cacheFile) {
    const cacheConfig = readYaml(join(configDir, cacheFile))
    if (cacheConfig !== null && cacheConfig.type === 'redis') {
      services.push('cache')
      backends.cache = 'redis'
    }
  }

  // 存储：s3 需要对象存储
  const storageFile = files.find(f => f.startsWith('_storage.'))
  if (storageFile) {
    const storageConfig = readYaml(join(configDir, storageFile))
    if (storageConfig !== null && detectStorageIsS3(storageConfig)) {
      services.push('storage')
      backends.storage = 's3'
    }
  }

  // 向量数据库：记录后端（qdrant / pgvector / lancedb / chroma）
  const vecdbFile = files.find(f => f.startsWith('_vecdb.'))
  if (vecdbFile) {
    const vecdbConfig = readYaml(join(configDir, vecdbFile))
    if (vecdbConfig !== null) {
      services.push('vecdb')
      backends.vecdb = (vecdbConfig.type as string | undefined) ?? 'qdrant'
    }
  }

  // reach（邮件 / 短信）为外部 API，不生成 sidecar
  const reachFile = files.find(f => f.startsWith('_reach.'))
  if (reachFile) {
    const reachConfig = readYaml(join(configDir, reachFile))
    if (reachConfig !== null) {
      detectReachServices(reachConfig, services)
    }
  }

  return { services, backends }
}

/**
 * 判断存储配置是否使用 S3（直接配置或多 provider 配置）
 *
 * @param config - 存储配置内容
 */
function detectStorageIsS3(config: Record<string, unknown>): boolean {
  if (config.type === 's3') {
    return true
  }
  const providers = config.providers as Record<string, unknown> | undefined
  if (providers === undefined) {
    return false
  }
  return Object.values(providers).some(p => (p as Record<string, unknown> | undefined)?.type === 's3')
}

/**
 * 检测 reach 配置中的邮件和短信需求
 *
 * @param config - reach 配置内容
 * @param services - 服务列表（原地修改）
 */
function detectReachServices(config: Record<string, unknown>, services: ServiceType[]): void {
  const providers = config.providers as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(providers)) {
    return
  }

  let hasEmail = false
  let hasSms = false

  for (const provider of providers) {
    const providerType = provider.type as string | undefined
    // smtp / api / resend 类型视为邮件需求
    if (!hasEmail && (providerType === 'smtp' || providerType === 'api')) {
      hasEmail = true
      services.push('email')
    }
    // aliyun-sms 类型视为短信需求
    if (!hasSms && providerType === 'aliyun-sms') {
      hasSms = true
      services.push('sms')
    }
  }
}

// ─── 公共 API ───

/**
 * 扫描应用目录，检测框架类型、模块依赖和所需基础设施
 *
 * @param appDir - 应用根目录绝对路径
 * @returns 扫描结果（ScanResult）
 *
 * @example
 * ```ts
 * const result = await scanApp('/path/to/my-app')
 * if (result.success) {
 *   const { appName, isSvelteKit, requiredServices } = result.data
 * }
 * ```
 */
export async function scanApp(appDir: string): Promise<HaiResult<ScanResult>> {
  logger.debug('Scanning application', { appDir })

  try {
    // 读取 package.json
    const pkg = readJson(join(appDir, 'package.json'))
    if (pkg === null) {
      return err(
        HaiDeployError.SCAN_FAILED,
        deployM('deploy_scanFailed', { params: { error: 'package.json not found' } }),
      )
    }

    const appName = extractAppName(pkg)
    const isSvelteKit = existsSync(join(appDir, 'svelte.config.js'))
      || existsSync(join(appDir, 'svelte.config.ts'))
    const adapterInstalled = hasDependency(pkg, '@sveltejs/adapter-vercel')
    const nodeAdapterInstalled = hasDependency(pkg, '@sveltejs/adapter-node')
    const configDir = join(appDir, 'config')
    const configDetection = detectRequiredServices(configDir)
    const depServices = detectServicesFromDependencies(pkg)
    // 合并去重：config 检测优先，依赖检测补充
    const requiredServices = Array.from(new Set([...configDetection.services, ...depServices]))
    const scripts = pkg.scripts as Record<string, string> | undefined
    const buildCommand = scripts?.build ?? 'pnpm build'

    const scanResult: ScanResult = {
      appName,
      isSvelteKit,
      adapterInstalled,
      nodeAdapterInstalled,
      requiredServices,
      serviceBackends: configDetection.backends,
      buildCommand,
    }

    logger.info('Application scanned', {
      appName,
      isSvelteKit,
      adapterInstalled,
      nodeAdapterInstalled,
      requiredServices,
      serviceBackends: configDetection.backends,
    })

    return ok(scanResult)
  }
  catch (error) {
    logger.error('Application scan failed', { appDir, error })
    return err(
      HaiDeployError.SCAN_FAILED,
      deployM('deploy_scanFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      error,
    )
  }
}

/**
 * 从 package.json 的 @h-ai/* 依赖推断所需服务
 *
 * 依赖映射规则：
 * - @h-ai/reldb → 'db'
 * - @h-ai/cache → 'cache'
 * - @h-ai/storage → 'storage'
 *
 * @param pkg - package.json 内容
 * @returns 需要的服务类型列表
 */
function detectServicesFromDependencies(pkg: Record<string, unknown>): ServiceType[] {
  const depMap: Record<string, ServiceType> = {
    '@h-ai/reldb': 'db',
    '@h-ai/cache': 'cache',
    '@h-ai/storage': 'storage',
    '@h-ai/vecdb': 'vecdb',
  }
  const services: ServiceType[] = []
  for (const [depName, serviceType] of Object.entries(depMap)) {
    if (hasDependency(pkg, depName)) {
      services.push(serviceType)
    }
  }
  return services
}

/**
 * 从 package.json 提取应用名称
 *
 * 移除 scope 前缀（如 @h-ai/admin-console → admin-console）
 *
 * @param pkg - package.json 内容
 * @returns 应用名称
 */
function extractAppName(pkg: Record<string, unknown>): string {
  const name = (pkg.name as string) ?? 'app'
  // 移除 scope 前缀
  const slashIndex = name.indexOf('/')
  if (slashIndex >= 0) {
    return name.slice(slashIndex + 1)
  }
  return name
}
