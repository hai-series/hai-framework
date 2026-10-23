/**
 * @h-ai/deploy — Neon PostgreSQL Provisioner
 *
 * 通过 Neon REST API 自动创建 PostgreSQL 数据库。
 * @module deploy-provisioner-neon
 */

import type { HaiResult } from '@h-ai/core'
import type { ServiceProvisioner } from '../deploy-internal-types.js'
import type { ProvisionResult } from '../deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { deployM } from '../deploy-i18n.js'
import { recoveryFailure } from '../deploy-recovery.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-neon' })

/** Neon API 基址 */
const NEON_API = 'https://console.neon.tech/api/v2'

/** Neon 新建项目默认生成的数据库名。 */
const DEFAULT_NEON_DATABASE_NAME = 'neondb'

/** Neon 新建项目默认生成的角色名。 */
const DEFAULT_NEON_ROLE_NAME = 'neondb_owner'

/**
 * Neon 列表中用于按名称核对现有资源的字段。
 * @example 模块内部上下文
 * ```ts
 * const project: NeonProjectSummary = { id: 'project-shop', name: 'shop' }
 * ```
 */
interface NeonProjectSummary {
  id: string
  name: string
}

/**
 * 列表字段可缺失；调用方不能将请求失败解释为资源不存在。
 * @example 模块内部上下文
 * ```ts
 * const response: NeonProjectsResponse = { projects: [{ id: 'project-shop', name: 'shop' }] }
 * const existing = response.projects?.find(project => project.name === 'shop')
 * ```
 */
interface NeonProjectsResponse {
  projects?: NeonProjectSummary[]
}

/**
 * 创建回执的可选形状；连接 URI 可能包含口令，不得输出。
 * @example 模块内部上下文
 * ```ts
 * const response: NeonCreateProjectResponse = { project: { id: 'project-shop' } }
 * const id = response.project?.id // 无连接 URI 时再按已确认 ID 读取，不能重新创建。
 * ```
 */
interface NeonCreateProjectResponse {
  connection_uris?: Array<{ connection_uri?: string }>
  project?: { id?: string }
}

/**
 * 连接读取回执；真实 URI 可能含密码，必须作为私有配置处理。
 * @example 模块内部上下文
 * ```ts
 * const response: NeonConnectionUriResponse = { uri: 'postgresql://app@db.example.org/shop' }
 * const present = Boolean(response.uri)
 * ```
 */
interface NeonConnectionUriResponse {
  uri?: string
}

/** 统一发起 Neon API 请求。 */
async function neonFetch<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${NEON_API}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(deployM('deploy_apiError', { params: { service: 'Neon', status: String(response.status) } }))
  }

  return response.json() as Promise<T>
}

/** 列出当前账号下的 Neon 项目。 */
async function listNeonProjects(token: string): Promise<NeonProjectSummary[]> {
  const data = await neonFetch<NeonProjectsResponse>(token, '/projects')
  return data.projects ?? []
}

/** 按名称查找已有的 Neon 项目。 */
async function findExistingNeonProject(token: string, projectName: string): Promise<NeonProjectSummary | null> {
  const projects = await listNeonProjects(token)
  return projects.find(project => project.name === projectName) ?? null
}

/**
 * 获取现有项目的连接串。
 *
 * Neon 官方 OpenAPI 提供 `GET /projects/{project_id}/connection_uri`。
 * 这里使用创建项目时的默认数据库/角色名，保证本模块创建的项目可被幂等复用。
 */
async function getNeonConnectionUri(token: string, projectId: string): Promise<string> {
  const query = new URLSearchParams({
    database_name: DEFAULT_NEON_DATABASE_NAME,
    role_name: DEFAULT_NEON_ROLE_NAME,
  })
  const data = await neonFetch<NeonConnectionUriResponse>(
    token,
    `/projects/${projectId}/connection_uri?${query.toString()}`,
    { headers: { 'Content-Type': 'application/json' } },
  )

  if (!data.uri) {
    throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Neon' } }))
  }

  return data.uri
}

/** 构建统一的 Neon 开通结果。 */
function buildNeonProvisionResult(projectId: string, connectionUri: string, resourceStatus: 'created' | 'reused'): ProvisionResult {
  return {
    serviceType: 'db',
    provisionerName: 'neon',
    resourceStatus,
    envVars: {
      HAI_DB: JSON.stringify({ type: 'postgresql', url: connectionUri, database: decodeURIComponent(new URL(connectionUri).pathname.slice(1)) }),
    },
    resourceInfo: `neon-project:${projectId}`,
  }
}

/**
 * 创建 Neon PostgreSQL Provisioner
 * 工厂返回内部接口；认证与开通调用必须逐次检查 HaiResult，返回的连接凭据不能直接记录。
 * @returns ServiceProvisioner 实例
 * @example 模块内部上下文
 * ```ts
 * const apiKey = process.env.HAI_DEPLOY_SERVICES_DB_APIKEY
 * if (!apiKey) throw new Error('Provide HAI_DEPLOY_SERVICES_DB_APIKEY privately')
 * const provisioner = createNeonProvisioner()
 * const authenticated = await provisioner.authenticate({ apiKey })
 * if (!authenticated.success) throw new Error(authenticated.error.message)
 * const result = await provisioner.provision('shop')
 * if (!result.success) throw new Error(result.error.message)
 * const status = result.data.resourceStatus
 * ```
 */
export function createNeonProvisioner(): ServiceProvisioner {
  let token: string | null = null

  return {
    name: 'neon',
    serviceType: 'db',

    async authenticate(credentials: Record<string, string>): Promise<HaiResult<string>> {
      logger.debug('Authenticating with Neon')
      try {
        const apiToken = credentials.apiKey ?? credentials.token ?? credentials.api_key ?? ''
        if (!apiToken) {
          throw new Error(deployM('deploy_credentialMissing', { params: { fields: 'token' } }))
        }

        await listNeonProjects(apiToken)
        token = apiToken
        logger.info('Neon authenticated')
        return ok('neon-user')
      }
      catch (error) {
        logger.error('Neon authentication failed', { error })
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
      if (!token) {
        return err(
          HaiDeployError.AUTH_REQUIRED,
          deployM('deploy_authRequired'),
        )
      }

      logger.debug('Provisioning Neon database', { appName })
      let resource: { resourceInfo: string, resourceStatus: 'created' | 'reused' } | undefined
      try {
        const projectName = `${appName}-db`

        const existingProject = await findExistingNeonProject(token, projectName)
        if (existingProject !== null) {
          resource = { resourceInfo: `neon-project:${existingProject.id}`, resourceStatus: 'reused' }
          const connectionUri = await getNeonConnectionUri(token, existingProject.id)
          logger.info('Neon project reused', {
            projectId: existingProject.id,
            projectName,
          })
          return ok(buildNeonProvisionResult(existingProject.id, connectionUri, 'reused'))
        }

        const data = await neonFetch<NeonCreateProjectResponse>(token, '/projects', {
          method: 'POST',
          body: JSON.stringify({
            project: {
              name: projectName,
              pg_version: 16,
            },
          }),
        })

        const projectId = data.project?.id ?? ''
        if (projectId)
          resource = { resourceInfo: `neon-project:${projectId}`, resourceStatus: 'created' }
        const connectionUri = data.connection_uris?.[0]?.connection_uri ?? ''
        if (!projectId || !connectionUri) {
          throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Neon' } }))
        }

        logger.info('Neon database provisioned', { projectId })

        return ok(buildNeonProvisionResult(projectId, connectionUri, 'created'))
      }
      catch (error) {
        logger.error('Neon provisioning failed', { appName })
        if (resource) {
          return recoveryFailure({ ...HaiDeployError.PROVISION_FAILED, message: '' }, {
            projectName: appName,
            stage: 'provision:db',
            resources: [{ serviceType: 'db', provisionerName: 'neon', ...resource }],
          })
        }
        return err(
          HaiDeployError.PROVISION_FAILED,
          deployM('deploy_provisionFailed', {
            params: {
              service: 'neon',
              error: error instanceof Error ? error.message : String(error),
            },
          }),
          error,
        )
      }
    },
  }
}
