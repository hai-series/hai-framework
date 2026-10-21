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
 * 定位构建目录；API workspace 的环境文件可在服务包，镜像仍位于工程根。
 * 只定位已约定的构建入口/锁文件，不从目录布局推断应用或中间件依赖。
 * @example `resolveArtifactDirectory('/workspace/demo/apps/demo-service')`
 */
export function resolveArtifactDirectory(appDir: string): string {
  let directory = resolve(appDir)
  while (true) {
    if (existsSync(join(directory, 'hai.build.json')) || existsSync(join(directory, 'pnpm-lock.yaml')))
      return join(directory, '.hai/build/docker')
    const parent = dirname(directory)
    if (parent === directory)
      return join(appDir, '.hai/build/docker')
    directory = parent
  }
}

/**
 * 判断同类连接中是否有默认配置项；具体变量前缀优先于服务类别，未指定时默认处理。
 * @example `usesDefaultMiddleware(scan, 'email', { serviceModes: { HAI_REACH_PROVIDERS_0: 'keep' } })`
 */
export function usesDefaultMiddleware(scan: ScanResult, service: ServiceType, options?: DeployAppOptions): boolean {
  const requirements = scan.middlewares?.filter(item => item.service === service) ?? []
  return requirements.length
    ? requirements.some(item => (options?.serviceModes?.[item.envPrefix] ?? options?.serviceModes?.[service] ?? 'default') === 'default')
    : (options?.serviceModes?.[service] ?? 'default') === 'default'
}

/**
 * 解析构建产物目录
 *
 * @param appDir - 应用根目录
 * @param providerType - Provider 类型
 * @returns 产物目录路径
 */
export function resolveOutputDir(appDir: string, providerType: string): string {
  switch (providerType) {
    case 'vercel':
      return join(appDir, '.vercel', 'output')
    default:
      return join(appDir, 'build')
  }
}
