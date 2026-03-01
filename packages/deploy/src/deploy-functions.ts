/**
 * @h-ai/deploy — 部署辅助函数
 *
 * 包含构建、产物目录解析等与部署流程相关的辅助操作。 从 deploy-main.ts 中提取，遵循 main 仅做生命周期管理的规范。
 * @module deploy-functions
 */

import type { Result } from '@h-ai/core'
import type { DeployError } from './deploy-types.js'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { core, err, ok } from '@h-ai/core'
import { DeployErrorCode } from './deploy-config.js'
import { deployM } from './deploy-i18n.js'

const logger = core.logger.child({ module: 'deploy', scope: 'functions' })

/**
 * 执行应用构建
 *
 * @param appDir - 应用根目录
 * @param buildCommand - 构建命令
 * @returns 构建结果
 */
export function buildApp(appDir: string, buildCommand: string): Result<void, DeployError> {
  logger.info('Building application', { appDir, buildCommand })
  try {
    execSync(buildCommand, {
      cwd: appDir,
      stdio: 'inherit',
      env: { ...process.env },
    })
    return ok(undefined)
  }
  catch (error) {
    return err({
      code: DeployErrorCode.BUILD_FAILED,
      message: deployM('deploy_buildFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
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
