/**
 * @h-ai/deploy — 应用扫描器
 *
 * 扫描应用目录，检测框架类型、模块依赖和所需基础设施。
 * @module deploy-scanner
 */

import type { Result } from '@h-ai/core'
import type { DeployError, ScanResult, ServiceType } from './deploy-types.js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { parse } from 'yaml'
import { DeployErrorCode } from './deploy-config.js'
import { deployM } from './deploy-i18n.js'

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
 * 扫描 config/ 目录，推断所需基础设施服务
 *
 * @param configDir - 配置目录路径
 * @returns 需要的服务类型列表
 */
function detectRequiredServices(configDir: string): ServiceType[] {
  const services: ServiceType[] = []

  if (!existsSync(configDir)) {
    return services
  }

  const files = readdirSync(configDir)

  // 检测数据库需求
  if (files.includes('_db.yml') || files.includes('_db.yaml')) {
    const dbConfig = readYaml(join(configDir, files.find(f => f.startsWith('_db.'))!))
    // sqlite 在云端也需要切换为 postgresql，标记为需要 db
    if (dbConfig !== null) {
      services.push('db')
    }
  }

  // 检测缓存需求
  if (files.includes('_cache.yml') || files.includes('_cache.yaml')) {
    const cacheConfig = readYaml(join(configDir, files.find(f => f.startsWith('_cache.'))!))
    if (cacheConfig !== null) {
      const cacheType = cacheConfig.type as string | undefined
      // memory 模式不需要外部服务，redis 需要
      if (cacheType === 'redis') {
        services.push('cache')
      }
    }
  }

  // 检测存储需求
  if (files.includes('_storage.yml') || files.includes('_storage.yaml')) {
    const storageConfig = readYaml(join(configDir, files.find(f => f.startsWith('_storage.'))!))
    if (storageConfig !== null) {
      detectStorageServices(storageConfig, services)
    }
  }

  // 检测 reach（邮件 / 短信）需求
  if (files.includes('_reach.yml') || files.includes('_reach.yaml')) {
    const reachConfig = readYaml(join(configDir, files.find(f => f.startsWith('_reach.'))!))
    if (reachConfig !== null) {
      detectReachServices(reachConfig, services)
    }
  }

  return services
}

/**
 * 检测存储配置中的 S3 需求
 *
 * @param config - 存储配置内容
 * @param services - 服务列表（原地修改）
 */
function detectStorageServices(config: Record<string, unknown>, services: ServiceType[]): void {
  // 直接配置
  if (config.type === 's3') {
    services.push('storage')
    return
  }
  // 多 provider 配置
  const providers = config.providers as Record<string, unknown> | undefined
  if (providers === undefined) {
    return
  }
  for (const providerConfig of Object.values(providers)) {
    const typed = providerConfig as Record<string, unknown> | undefined
    if (typed?.type === 's3') {
      services.push('storage')
      return
    }
  }
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
export async function scanApp(appDir: string): Promise<Result<ScanResult, DeployError>> {
  logger.debug('Scanning application', { appDir })

  try {
    // 读取 package.json
    const pkg = readJson(join(appDir, 'package.json'))
    if (pkg === null) {
      return err({
        code: DeployErrorCode.SCAN_FAILED,
        message: deployM('deploy_scanFailed', { params: { error: 'package.json not found' } }),
      })
    }

    const appName = extractAppName(pkg)
    const isSvelteKit = existsSync(join(appDir, 'svelte.config.js'))
      || existsSync(join(appDir, 'svelte.config.ts'))
    const adapterInstalled = hasDependency(pkg, '@sveltejs/adapter-vercel')
    const configDir = join(appDir, 'config')
    const configServices = detectRequiredServices(configDir)
    const depServices = detectServicesFromDependencies(pkg)
    // 合并去重：config 检测优先，依赖检测补充
    const requiredServices = Array.from(new Set([...configServices, ...depServices]))
    const scripts = pkg.scripts as Record<string, string> | undefined
    const buildCommand = scripts?.build ?? 'pnpm build'

    const scanResult: ScanResult = {
      appName,
      isSvelteKit,
      adapterInstalled,
      requiredServices,
      buildCommand,
    }

    logger.info('Application scanned', {
      appName,
      isSvelteKit,
      adapterInstalled,
      requiredServices,
    })

    return ok(scanResult)
  }
  catch (error) {
    logger.error('Application scan failed', { appDir, error })
    return err({
      code: DeployErrorCode.SCAN_FAILED,
      message: deployM('deploy_scanFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

/**
 * 从 package.json 的 @h-ai/* 依赖推断所需服务
 *
 * 依赖映射规则：
 * - @h-ai/db → 'db'
 * - @h-ai/cache → 'cache'
 * - @h-ai/storage → 'storage'
 *
 * @param pkg - package.json 内容
 * @returns 需要的服务类型列表
 */
function detectServicesFromDependencies(pkg: Record<string, unknown>): ServiceType[] {
  const depMap: Record<string, ServiceType> = {
    '@h-ai/db': 'db',
    '@h-ai/cache': 'cache',
    '@h-ai/storage': 'storage',
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
