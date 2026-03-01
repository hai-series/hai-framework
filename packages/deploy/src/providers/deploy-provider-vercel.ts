/**
 * @h-ai/deploy — Vercel 部署 Provider
 *
 * 封装 Vercel REST API，实现 DeployProvider 接口。 使用原生 fetch 调用，零外部 SDK 依赖。
 * @module deploy-provider-vercel
 */

import type { Result } from '@h-ai/core'
import type { DeployErrorCodeType } from '../deploy-config.js'
import type { DeployError, DeployProvider, DeployResult } from '../deploy-types.js'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { DeployErrorCode } from '../deploy-config.js'
import { deployM } from '../deploy-i18n.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provider-vercel' })

/** Vercel API 基址 */
const VERCEL_API = 'https://api.vercel.com'

/** 部署状态轮询间隔（毫秒） */
const POLL_INTERVAL = 3000

/** 部署状态轮询最大次数 */
const MAX_POLL_ATTEMPTS = 60

// ─── 内部工具 ───

/** 构造标准错误对象 */
function toDeployError(code: DeployErrorCodeType, messageKey: string, error: unknown): DeployError {
  return {
    code,
    message: deployM(messageKey as Parameters<typeof deployM>[0], {
      params: { error: error instanceof Error ? error.message : String(error) },
    }),
    cause: error,
  }
}

/**
 * 发送 Vercel API 请求
 *
 * @param token - API Token
 * @param path - API 路径（如 /v2/user）
 * @param options - fetch 选项
 * @returns 解析后的 JSON 响应
 */
async function vercelFetch<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const url = `${VERCEL_API}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(deployM('deploy_apiError', { params: { service: 'Vercel', status: String(response.status), body } }))
  }

  return response.json() as Promise<T>
}

/**
 * 递归收集目录中的所有文件
 *
 * @param dir - 目录路径
 * @param baseDir - 基础目录（用于计算相对路径）
 * @returns 文件相对路径列表
 */
function collectFiles(dir: string, baseDir: string): string[] {
  const results: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir))
    }
    else {
      results.push(relative(baseDir, fullPath))
    }
  }

  return results
}

// ─── Provider 工厂 ───

/**
 * 创建 Vercel 部署 Provider
 *
 * @returns DeployProvider 实例
 *
 * @example
 * ```ts
 * const provider = createVercelProvider()
 * await provider.authenticate('vel_xxx')
 * const projectId = await provider.createProject('my-app')
 * ```
 */
export function createVercelProvider(): DeployProvider {
  let token: string | null = null

  return {
    name: 'vercel',

    async authenticate(apiToken: string): Promise<Result<string, DeployError>> {
      logger.debug('Authenticating with Vercel')
      try {
        const user = await vercelFetch<{ user: { username: string, email: string } }>(
          apiToken,
          '/v2/user',
        )
        token = apiToken
        const username = user.user.username || user.user.email
        logger.info('Vercel authenticated', { user: username })
        return ok(username)
      }
      catch (error) {
        logger.error('Vercel authentication failed', { error })
        return err(toDeployError(DeployErrorCode.AUTH_FAILED, 'deploy_authFailed', error))
      }
    },

    async createProject(projectName: string): Promise<Result<string, DeployError>> {
      if (!token) {
        return err({
          code: DeployErrorCode.AUTH_REQUIRED,
          message: deployM('deploy_authRequired'),
        })
      }

      logger.debug('Creating Vercel project', { projectName })
      try {
        // 先查找已有项目
        const existingId = await findExistingProject(token, projectName)
        if (existingId !== null) {
          logger.info('Vercel project found', { projectName, projectId: existingId })
          return ok(existingId)
        }

        // 创建新项目
        const project = await vercelFetch<{ id: string }>(
          token,
          '/v10/projects',
          {
            method: 'POST',
            body: JSON.stringify({
              name: projectName,
              framework: 'sveltekit',
            }),
          },
        )
        logger.info('Vercel project created', { projectName, projectId: project.id })
        return ok(project.id)
      }
      catch (error) {
        logger.error('Vercel project creation failed', { projectName, error })
        return err(toDeployError(DeployErrorCode.PROJECT_CREATE_FAILED, 'deploy_projectCreateFailed', error))
      }
    },

    async setEnvVars(projectId: string, envVars: Record<string, string>): Promise<Result<void, DeployError>> {
      if (!token) {
        return err({
          code: DeployErrorCode.AUTH_REQUIRED,
          message: deployM('deploy_authRequired'),
        })
      }

      logger.debug('Setting Vercel env vars', { projectId, count: Object.keys(envVars).length })
      try {
        const envEntries = Object.entries(envVars).map(([key, value]) => ({
          key,
          value,
          type: 'encrypted' as const,
          target: ['production', 'preview', 'development'],
        }))

        await vercelFetch(
          token,
          `/v10/projects/${projectId}/env`,
          {
            method: 'POST',
            body: JSON.stringify(envEntries),
          },
        )
        logger.info('Vercel env vars set', { projectId, count: envEntries.length })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Vercel env vars setup failed', { projectId, error })
        return err(toDeployError(DeployErrorCode.ENV_VAR_FAILED, 'deploy_envVarFailed', error))
      }
    },

    async deploy(projectId: string, outputDir: string): Promise<Result<DeployResult, DeployError>> {
      if (!token) {
        return err({
          code: DeployErrorCode.AUTH_REQUIRED,
          message: deployM('deploy_authRequired'),
        })
      }

      logger.debug('Deploying to Vercel', { projectId, outputDir })
      try {
        // 收集所有文件
        const filePaths = collectFiles(outputDir, outputDir)
        const files: Array<{ file: string, sha: string, size: number }> = []

        // 上传每个文件
        for (const filePath of filePaths) {
          const fullPath = join(outputDir, filePath)
          const content = readFileSync(fullPath)
          const sha = createHash('sha1').update(content).digest('hex')
          const size = statSync(fullPath).size

          await uploadFile(token, content, sha)
          files.push({ file: filePath, sha, size })
        }

        logger.debug('Files uploaded', { count: files.length })

        // 创建部署
        const deployment = await vercelFetch<{ id: string, url: string }>(
          token,
          '/v13/deployments',
          {
            method: 'POST',
            body: JSON.stringify({
              name: projectId,
              files,
              projectSettings: { framework: 'sveltekit' },
            }),
          },
        )

        // 轮询部署状态
        const finalStatus = await pollDeploymentStatus(token, deployment.id)

        const result: DeployResult = {
          url: `https://${deployment.url}`,
          deploymentId: deployment.id,
          status: finalStatus,
          envVarsSet: [],
        }

        logger.info('Vercel deployment complete', {
          deploymentId: deployment.id,
          url: result.url,
          status: finalStatus,
        })

        return ok(result)
      }
      catch (error) {
        logger.error('Vercel deployment failed', { projectId, error })
        return err(toDeployError(DeployErrorCode.UPLOAD_FAILED, 'deploy_uploadFailed', error))
      }
    },
  }
}

// ─── 内部辅助 ───

/**
 * 查找已有的 Vercel 项目
 *
 * @param token - API Token
 * @param projectName - 项目名称
 * @returns 项目 ID，不存在时返回 null
 */
async function findExistingProject(token: string, projectName: string): Promise<string | null> {
  try {
    const project = await vercelFetch<{ id: string }>(token, `/v10/projects/${projectName}`)
    return project.id
  }
  catch {
    return null
  }
}

/**
 * 上传单个文件到 Vercel
 *
 * @param token - API Token
 * @param content - 文件内容
 * @param sha - 文件 SHA1 哈希
 */
async function uploadFile(token: string, content: Uint8Array, sha: string): Promise<void> {
  const url = `${VERCEL_API}/v2/files`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'x-vercel-digest': sha,
    },
    body: new Blob([content.buffer as ArrayBuffer]),
  })

  if (!response.ok && response.status !== 409) {
    // 409 表示文件已存在，可忽略
    const body = await response.text()
    throw new Error(deployM('deploy_fileUploadFailed', { params: { status: String(response.status), body } }))
  }
}

/**
 * 轮询部署状态直到完成
 *
 * @param token - API Token
 * @param deploymentId - 部署 ID
 * @returns 最终状态
 */
async function pollDeploymentStatus(
  token: string,
  deploymentId: string,
): Promise<'ready' | 'building' | 'error'> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const deployment = await vercelFetch<{ readyState: string }>(
      token,
      `/v13/deployments/${deploymentId}`,
    )

    if (deployment.readyState === 'READY') {
      return 'ready'
    }
    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      return 'error'
    }

    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
  }

  // 超时仍在构建
  return 'building'
}
