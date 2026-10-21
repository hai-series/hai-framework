/**
 * @h-ai/deploy — 部署辅助函数
 *
 * 包含构建、产物目录解析等与部署流程相关的辅助操作。 从 deploy-main.ts 中提取，遵循 main 仅做生命周期管理的规范。
 * @module deploy-functions
 */

import type { HaiResult } from '@h-ai/core'
import type { DeployAppOptions, ScanResult, ServiceType } from './deploy-types.js'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { core, err, ok } from '@h-ai/core'
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'functions' })

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
 * 执行应用构建
 *
 * @param appDir - 应用根目录
 * @param buildCommand - 构建命令
 * @param envVars - 当前部署开通结果，确保构建与运行使用同一配置
 * @returns 构建结果
 */
export function buildApp(appDir: string, buildCommand: string, envVars: Record<string, string> = {}): HaiResult<void> {
  logger.info('Building application', { appDir, buildCommand })
  try {
    execSync(buildCommand, {
      cwd: appDir,
      stdio: 'inherit',
      env: { ...process.env, ...envVars },
    })
    return ok(undefined)
  }
  catch (error) {
    return err(
      HaiDeployError.BUILD_FAILED,
      deployM('deploy_buildFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      error,
    )
  }
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
    case 'vercel': {
      const vercelOutput = join(appDir, '.vercel', 'output')
      if (existsSync(vercelOutput)) {
        return vercelOutput
      }
      // 回退到标准 build 目录
      return join(appDir, 'build')
    }
    default:
      return join(appDir, 'build')
  }
}
