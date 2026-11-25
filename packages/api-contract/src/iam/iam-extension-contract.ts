import { z } from 'zod'
import { paginatedSchema, PaginationQuerySchema } from '../common/pagination-schemas.js'
import { haiResultSchema, HaiVoidResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import { IamPermissionSchema } from './iam-schemas.js'

const idSchema = z.string().trim().min(1)
const resourceInputSchema = z.strictObject({ id: idSchema })
const dateSchema = z.coerce.date()

/**
 * API Key 的公开元数据，日期可从 HTTP JSON 解析。
 * @example
 * ```ts
 * import { IamApiKeySchema } from '@h-ai/api-contract'
 * const key = IamApiKeySchema.parse({ id: 'key-1', userId: 'user-1', name: 'Reports', keyPrefix: 'hai_prefix', enabled: true, createdAt: '2027-01-01T00:00:00.000Z', expiresAt: null, lastUsedAt: null, scopes: ['reports:read'] })
 * void key.keyPrefix
 * ```
 */
export const IamApiKeySchema = z.object({
  id: idSchema,
  userId: idSchema,
  name: z.string(),
  keyPrefix: z.string(),
  enabled: z.boolean(),
  expiresAt: dateSchema.nullable(),
  createdAt: dateSchema,
  lastUsedAt: dateSchema.nullable(),
  scopes: z.array(z.string()),
})

/**
 * 指定账号的 API Key 分页查询参数。
 * @example
 * ```ts
 * import { IamListApiKeysInputSchema } from '@h-ai/api-contract'
 * const input = IamListApiKeysInputSchema.parse({ userId: 'user-1', enabled: 'false', page: '1' })
 * void input.enabled
 * ```
 */
export const IamListApiKeysInputSchema = PaginationQuerySchema.extend({
  userId: idSchema,
  search: z.string().optional(),
  enabled: z.union([
    z.boolean(),
    z.enum(['true', 'false']).transform(value => value === 'true'),
  ]).optional(),
  sortBy: z.enum([
    'name',
    'createdAt',
    'lastUsedAt',
    'expiresAt',
  ]).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
})

/**
 * 代指定账号创建 API Key 的请求体。省略有效期天数时使用 IAM 配置，`0` 表示不设置过期时间。
 * @example
 * ```ts
 * import { IamCreateApiKeyInputSchema } from '@h-ai/api-contract'
 * const input = IamCreateApiKeyInputSchema.parse({ userId: 'user-1', name: 'Reports', expirationDays: 30, scopes: ['reports:read'] })
 * void input.name
 * ```
 */
export const IamCreateApiKeyInputSchema = z.strictObject({
  userId: idSchema,
  name: z.string().trim().min(1).max(100),
  // 将 days 转成毫秒后仍须是可安全表达的数值及有效日期。
  expirationDays: z.number().int().min(0).max(99_000_000).optional(),
  scopes: z.array(z.string().trim().min(1)).optional(),
})

/**
 * 替换角色全部权限的入参。`permissionIds: []` 清空该角色的权限关联。
 * @example
 * ```ts
 * import { IamReplaceRolePermissionsInputSchema } from '@h-ai/api-contract'
 * const input = IamReplaceRolePermissionsInputSchema.parse({ id: 'role-1', permissionIds: ['permission-2'] })
 * void input.permissionIds
 * ```
 */
export const IamReplaceRolePermissionsInputSchema = z.strictObject({
  id: idSchema,
  permissionIds: z.array(idSchema),
})

/**
 * 由应用显式挂载的 IAM 管理契约。创建 API Key 时仅本次返回明文 `rawKey`。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * const contract = apiContract.create({ iamManagement: apiContract.extensions.iam })
 * void contract.iamManagement.apiKeys.list
 * ```
 */
export const iamExtensionContract = {
  apiKeys: {
    list: route({
      method: 'GET',
      path: '/iam/api-keys',
      operationId: 'iam.apiKeys.list',
      summary: 'List API keys for a user',
      tags: ['iam', 'api-keys'],
    })
      .input(IamListApiKeysInputSchema)
      .output(haiResultSchema(paginatedSchema(IamApiKeySchema))),
    create: route({
      method: 'POST',
      path: '/iam/api-keys',
      operationId: 'iam.apiKeys.create',
      summary: 'Create an API key for a user',
      tags: ['iam', 'api-keys'],
    })
      .input(IamCreateApiKeyInputSchema)
      .output(haiResultSchema(z.object({
        apiKey: IamApiKeySchema,
        rawKey: z.string(),
      }))),
    get: route({
      method: 'GET',
      path: '/iam/api-keys/{id}',
      operationId: 'iam.apiKeys.get',
      summary: 'Get API key metadata',
      tags: ['iam', 'api-keys'],
    })
      .input(resourceInputSchema)
      .output(haiResultSchema(IamApiKeySchema)),
    revoke: route({
      method: 'DELETE',
      path: '/iam/api-keys/{id}',
      operationId: 'iam.apiKeys.delete',
      summary: 'Revoke an API key',
      tags: ['iam', 'api-keys'],
    })
      .input(resourceInputSchema)
      .output(HaiVoidResultSchema),
  },
  roles: {
    listPermissions: route({
      method: 'GET',
      path: '/iam/roles/{id}/permissions',
      operationId: 'iam.roles.listPermissions',
      summary: 'List permissions directly assigned to a role',
      tags: ['iam', 'roles'],
    })
      .input(resourceInputSchema)
      .output(haiResultSchema(z.array(IamPermissionSchema))),
    replacePermissions: route({
      method: 'PUT',
      path: '/iam/roles/{id}/permissions',
      operationId: 'iam.roles.replacePermissions',
      summary: 'Replace permissions assigned to a role',
      tags: ['iam', 'roles'],
    })
      .input(IamReplaceRolePermissionsInputSchema)
      .output(HaiVoidResultSchema),
  },
}

/**
 * 显式挂载的 IAM 管理契约类型。
 * @example
 * ```ts
 * import { type IamExtensionContract, apiContract } from '@h-ai/api-contract'
 * const contract: IamExtensionContract = apiContract.extensions.iam
 * void contract
 * ```
 */
export type IamExtensionContract = typeof iamExtensionContract
