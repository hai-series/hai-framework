/**
 * @h-ai/deploy — 部署辅助函数
 *
 * 包含已有产物目录解析等与部署流程相关的辅助操作。 从 deploy-main.ts 中提取，遵循 main 仅做生命周期管理的规范。
 * @module deploy-functions
 */

import type { DeployAppOptions, ScanResult, ServiceType } from './deploy-types.js'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * 资源身份与执行、计划共用同一归一化规则。
 * @example 模块内部上下文
 * ```ts
 * const name = normalizeProjectName('@shop/orders')
 * ```
 */
export function normalizeProjectName(name: string): string {
  return name.replace(/^@[^/]+\//, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'app'
}

/**
 * 定位工程根；API workspace 的环境文件可在服务包，构建与部署缓存仍位于工程根。
 * 只定位已约定的构建入口/锁文件，不从目录布局推断应用或中间件依赖。
 * 从目标包向上查找构建入口或锁文件；返回目录不表示清单已存在或通过校验。
 * @param appDir - 部署目标应用目录。
 * @returns 最近的工程入口目录；未找到入口时返回应用目录的绝对路径。
 * @example 模块内部上下文
 * ```ts
 * const project = resolveProjectDirectory('/workspace/shop/apps/shop-service')
 * ```
 */
export function resolveProjectDirectory(appDir: string): string {
  let directory = resolve(appDir)
  while (true) {
    if (existsSync(join(directory, 'hai.json')) || existsSync(join(directory, 'pnpm-lock.yaml')))
      return directory
    const parent = dirname(directory)
    if (parent === directory)
      return resolve(appDir)
    directory = parent
  }
}

/**
 * 定位工程根的构建缓存目录；环境文件留在服务包时也沿用同一工程根。
 * @param appDir - 部署目标应用目录。
 * @returns 约定的 .hai/build/docker 目录；不保证其中制品存在或通过校验。
 * @example 模块内部上下文
 * ```ts
 * const directory = resolveArtifactDirectory('/workspace/shop/apps/shop-service')
 * ```
 */
export function resolveArtifactDirectory(appDir: string): string {
  return join(resolveProjectDirectory(appDir), '.hai/build/docker')
}

/**
 * 判断同类连接中是否有默认配置项；具体变量前缀优先于服务类别，未指定时默认处理。
 * @param scan - 依据实际依赖图及环境得到的扫描结果。
 * @param service - 待判断的中间件类别。
 * @param options - 本次操作选项；字段含义见各子项。
 * @returns 同类连接中存在采用 default 策略的项时为 true。
 * @example 模块内部上下文
 * ```ts
 * const scan: ScanResult = { appName: 'shop', isSvelteKit: false, adapterInstalled: false, nodeAdapterInstalled: false, requiredServices: [], serviceBackends: {} }
 * const enabled = usesDefaultMiddleware(scan, 'db', { serviceModes: { db: 'keep' } }) // false
 * ```
 */
export function usesDefaultMiddleware(scan: ScanResult, service: ServiceType, options?: DeployAppOptions): boolean {
  const requirements = scan.middlewares?.filter(item => item.service === service) ?? []
  return requirements.length
    ? requirements.some(item => (options?.serviceModes?.[item.envPrefix] ?? options?.serviceModes?.[service] ?? 'default') === 'default')
    : (options?.serviceModes?.[service] ?? 'default') === 'default'
}

/**
 * 解析构建产物目录
 * @param appDir - 应用根目录
 * @param providerType - Provider 类型
 * @returns 产物目录路径
 * @example 模块内部上下文
 * ```ts
 * const directory = resolveOutputDir('/workspace/shop', 'vercel') // /workspace/shop/.vercel/output
 * ```
 */
export function resolveOutputDir(appDir: string, providerType: string): string {
  switch (providerType) {
    case 'vercel':
      return join(appDir, '.vercel', 'output')
    default:
      return join(appDir, 'build')
  }
}
