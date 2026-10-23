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
import { recoveryFailure } from '../deploy-recovery.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-upstash' })

/** Upstash API 基址 */
const UPSTASH_API = 'https://api.upstash.com'

/**
 * 供应商 API 的部分字段形状；缺少连接凭据时不能声称已有连接可用。
 * @example 模块内部上下文
 * ```ts
 * const database: UpstashDatabase = { database_id: 'redis-shop', database_name: 'shop', endpoint: 'redis.example.org', port: 6379 }
 * const id = database.database_id
 * ```
 */
interface UpstashDatabase {
  database_id?: string
  database_name?: string
  endpoint?: string
  port?: number
  password?: string
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

/** 将 Upstash 响应转换为 deploy 统一结果。 */
function buildUpstashProvisionResult(database: UpstashDatabase, resourceStatus: 'created' | 'reused'): ProvisionResult {
  const databaseId = database.database_id ?? ''

  if (!databaseId || !database.endpoint || !database.password || !database.port) {
    throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Upstash' } }))
  }

  return {
    serviceType: 'cache',
    provisionerName: 'upstash',
    resourceStatus,
    envVars: {
      HAI_CACHE: JSON.stringify({ type: 'redis', url: `rediss://default:${encodeURIComponent(database.password)}@${database.endpoint}:${database.port}` }),
    },
    resourceInfo: `upstash-db:${databaseId}`,
  }
}

/**
 * 创建 Upstash Redis Provisioner
 * 工厂返回内部接口；认证与开通调用必须逐次检查 HaiResult，返回的连接凭据不能直接记录。
 * @returns ServiceProvisioner 实例
 * @example 模块内部上下文
 * ```ts
 * const email = process.env.HAI_DEPLOY_SERVICES_CACHE_EMAIL
 * if (!email) throw new Error('Provide HAI_DEPLOY_SERVICES_CACHE_EMAIL privately')
 * const apiKey = process.env.HAI_DEPLOY_SERVICES_CACHE_APIKEY
 * if (!apiKey) throw new Error('Provide HAI_DEPLOY_SERVICES_CACHE_APIKEY privately')
 * const provisioner = createUpstashProvisioner()
 * const authenticated = await provisioner.authenticate({ email, apiKey })
 * if (!authenticated.success) throw new Error(authenticated.error.message)
 * const result = await provisioner.provision('shop')
 * if (!result.success) throw new Error(result.error.message)
 * const status = result.data.resourceStatus
 * ```
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
      let resource: { resourceInfo: string, resourceStatus: 'created' | 'reused' } | undefined
      try {
        const databaseName = `${appName}-cache`

        const existingDatabase = await findExistingUpstashDatabase(email, apiKey, databaseName)
        if (existingDatabase !== null) {
          const databaseId = existingDatabase.database_id ?? ''
          if (!databaseId) {
            throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Upstash' } }))
          }

          resource = { resourceInfo: `upstash-db:${databaseId}`, resourceStatus: 'reused' }
          const detail = await getUpstashDatabase(email, apiKey, databaseId)
          logger.info('Upstash Redis reused', { databaseId, databaseName })
          return ok(buildUpstashProvisionResult({ ...existingDatabase, ...detail }, 'reused'))
        }

        const data = await upstashFetch<UpstashDatabase>(email, apiKey, '/v2/redis/database', {
          method: 'POST',
          body: JSON.stringify({
            name: databaseName,
            region: 'global',
            tls: true,
          }),
        })

        if (data.database_id)
          resource = { resourceInfo: `upstash-db:${data.database_id}`, resourceStatus: 'created' }
        logger.info('Upstash Redis provisioned', { databaseId: data.database_id })

        return ok(buildUpstashProvisionResult(data, 'created'))
      }
      catch (error) {
        logger.error('Upstash provisioning failed', { appName })
        if (resource) {
          return recoveryFailure({ ...HaiDeployError.PROVISION_FAILED, message: '' }, {
            projectName: appName,
            stage: 'provision:cache',
            resources: [{ serviceType: 'cache', provisionerName: 'upstash', ...resource }],
          })
        }
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
