/**
 * @h-ai/deploy — Upstash Redis Provisioner
 *
 * 通过 Upstash REST API 自动创建 Redis 数据库。
 * @module deploy-provisioner-upstash
 */

import type { HaiResult } from '@h-ai/core'
import type { ServiceProvisioner } from '../deploy-internal-types.js'
import type { ProvisionResult } from '../deploy-types.js'
import { Buffer } from 'node:buffer'
import { core, err, ok } from '@h-ai/core'

import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-upstash' })

/** Upstash API 基址 */
const UPSTASH_API = 'https://api.upstash.com'

interface UpstashDatabase {
  database_id?: string
  database_name?: string
  endpoint?: string
  rest_url?: string
  rest_token?: string
  password?: string
  token?: string
}

/** 构建 Upstash Developer API 的 Basic Auth 请求头。 */
function createUpstashAuthHeader(email: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`
}

/** 统一发起 Upstash Developer API 请求。 */
async function upstashFetch<T>(
  email: string,
  apiKey: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${UPSTASH_API}${path}`, {
    ...options,
    headers: {
      'Authorization': createUpstashAuthHeader(email, apiKey),
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(deployM('deploy_apiError', { params: { service: 'Upstash', status: String(response.status) } }))
  }

  return response.json() as Promise<T>
}

/** 列出当前账号下的所有 Upstash 数据库。 */
async function listUpstashDatabases(email: string, apiKey: string): Promise<UpstashDatabase[]> {
  return upstashFetch<UpstashDatabase[]>(email, apiKey, '/v2/redis/databases')
}

/** 按数据库名查找已有资源。 */
async function findExistingUpstashDatabase(
  email: string,
  apiKey: string,
  databaseName: string,
): Promise<UpstashDatabase | null> {
  const databases = await listUpstashDatabases(email, apiKey)
  return databases.find(database => database.database_name === databaseName) ?? null
}

/** 获取单个数据库详情。 */
async function getUpstashDatabase(email: string, apiKey: string, databaseId: string): Promise<UpstashDatabase> {
  return upstashFetch<UpstashDatabase>(email, apiKey, `/v2/redis/database/${databaseId}`)
}

/**
 * 解析 REST URL。
 *
 * Upstash 文档中的 Developer API 详情页可能返回 `endpoint` 或 `rest_url`，
 * 因此这里兼容两种字段形态。
 */
function resolveUpstashRestUrl(database: UpstashDatabase): string {
  if (typeof database.rest_url === 'string' && database.rest_url.length > 0) {
    return database.rest_url
  }

  const endpoint = database.endpoint?.trim() ?? ''
  if (!endpoint) {
    return ''
  }
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint
  }
  if (endpoint.includes('.')) {
    return `https://${endpoint}`
  }
  return `https://${endpoint}.upstash.io`
}

/**
 * 解析 REST Token。
 *
 * 某些响应会返回 `rest_token`，旧字段则可能仍使用 `password` / `token`。
 */
function resolveUpstashRestToken(database: UpstashDatabase): string {
  return database.rest_token ?? database.token ?? database.password ?? ''
}

/** 将 Upstash 响应转换为 deploy 统一结果。 */
function buildUpstashProvisionResult(database: UpstashDatabase): ProvisionResult {
  const databaseId = database.database_id ?? ''
  const restUrl = resolveUpstashRestUrl(database)
  const restToken = resolveUpstashRestToken(database)

  if (!databaseId || !restUrl || !restToken) {
    throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Upstash' } }))
  }

  return {
    serviceType: 'cache',
    provisionerName: 'upstash',
    envVars: {
      HAI_CACHE_UPSTASH_URL: restUrl,
      HAI_CACHE_UPSTASH_TOKEN: restToken,
    },
    resourceInfo: `upstash-db:${databaseId}`,
  }
}

/**
 * 创建 Upstash Redis Provisioner
 *
 * @returns ServiceProvisioner 实例
 */
export function createUpstashProvisioner(): ServiceProvisioner {
  let apiKey: string | null = null
  let email: string | null = null

  return {
    name: 'upstash',
    serviceType: 'cache',

    async authenticate(credentials: Record<string, string>): Promise<HaiResult<string>> {
      logger.debug('Authenticating with Upstash')
      try {
        const userEmail = credentials.email ?? ''
        const userKey = credentials.apiKey ?? credentials.api_key ?? credentials.token ?? ''
        if (!userEmail || !userKey) {
          throw new Error(deployM('deploy_credentialMissing', { params: { fields: 'email, api_key' } }))
        }

        await listUpstashDatabases(userEmail, userKey)

        email = userEmail
        apiKey = userKey
        logger.info('Upstash authenticated', { email: userEmail })
        return ok(userEmail)
      }
      catch (error) {
        logger.error('Upstash authentication failed', { error })
        return err(
          HaiDeployError.AUTH_FAILED,
          deployM('deploy_authFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          error,
        )
      }
    },

    async provision(appName: string): Promise<HaiResult<ProvisionResult>> {
      if (!apiKey || !email) {
        return err(
          HaiDeployError.AUTH_REQUIRED,
          deployM('deploy_authRequired'),
        )
      }

      logger.debug('Provisioning Upstash Redis', { appName })
      try {
        const databaseName = `${appName}-cache`

        const existingDatabase = await findExistingUpstashDatabase(email, apiKey, databaseName)
        if (existingDatabase !== null) {
          const databaseId = existingDatabase.database_id ?? ''
          if (!databaseId) {
            throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Upstash' } }))
          }

          const detail = await getUpstashDatabase(email, apiKey, databaseId)
          logger.info('Upstash Redis reused', { databaseId, databaseName })
          return ok(buildUpstashProvisionResult({ ...existingDatabase, ...detail }))
        }

        const data = await upstashFetch<UpstashDatabase>(email, apiKey, '/v2/redis/database', {
          method: 'POST',
          body: JSON.stringify({
            name: databaseName,
            region: 'global',
            tls: true,
          }),
        })

        logger.info('Upstash Redis provisioned', { databaseId: data.database_id })

        return ok(buildUpstashProvisionResult(data))
      }
      catch (error) {
        logger.error('Upstash provisioning failed', { appName, error })
        return err(
          HaiDeployError.PROVISION_FAILED,
          deployM('deploy_provisionFailed', {
            params: {
              service: 'upstash',
              error: error instanceof Error ? error.message : String(error),
            },
          }),
          error,
        )
      }
    },
  }
}
