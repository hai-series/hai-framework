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
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provisioner-neon' })

/** Neon API 基址 */
const NEON_API = 'https://console.neon.tech/api/v2'

/** Neon 新建项目默认生成的数据库名。 */
const DEFAULT_NEON_DATABASE_NAME = 'neondb'

/** Neon 新建项目默认生成的角色名。 */
const DEFAULT_NEON_ROLE_NAME = 'neondb_owner'

interface NeonProjectSummary {
  id: string
  name: string
}

interface NeonProjectsResponse {
  projects?: NeonProjectSummary[]
}

interface NeonCreateProjectResponse {
  connection_uris?: Array<{ connection_uri?: string }>
  project?: { id?: string }
}

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
function buildNeonProvisionResult(projectId: string, connectionUri: string): ProvisionResult {
  return {
    serviceType: 'db',
    provisionerName: 'neon',
    envVars: {
      HAI_RELDB_URL: connectionUri,
    },
    resourceInfo: `neon-project:${projectId}`,
  }
}

/**
 * 创建 Neon PostgreSQL Provisioner
 *
 * @returns ServiceProvisioner 实例
 *
 * @example
 * ```ts
 * const neon = createNeonProvisioner()
 * await neon.authenticate({ apiKey: 'neon_xxx' })
 * const result = await neon.provision('my-app')
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
      try {
        const projectName = `${appName}-db`

        const existingProject = await findExistingNeonProject(token, projectName)
        if (existingProject !== null) {
          const connectionUri = await getNeonConnectionUri(token, existingProject.id)
          logger.info('Neon project reused', {
            projectId: existingProject.id,
            projectName,
          })
          return ok(buildNeonProvisionResult(existingProject.id, connectionUri))
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
        const connectionUri = data.connection_uris?.[0]?.connection_uri ?? ''
        if (!projectId || !connectionUri) {
          throw new Error(deployM('deploy_provisionNoResult', { params: { service: 'Neon' } }))
        }

        logger.info('Neon database provisioned', { projectId })

        return ok(buildNeonProvisionResult(projectId, connectionUri))
      }
      catch (error) {
        logger.error('Neon provisioning failed', { appName, error })
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
