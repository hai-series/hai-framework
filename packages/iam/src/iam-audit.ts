/** 关键 IAM 变更的显式审计装配；不代理对象或复制凭据输入。 */
import type { CreateAuditLogInput } from '@h-ai/audit'
import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { ApiKeyOperations, AuthnOperations, AuthRequestContext, AuthResult, AuthzOperations, SessionOperations, UserOperations } from './iam-types.js'
import { audit } from '@h-ai/audit'
import { core } from '@h-ai/core'

const logger = core.logger.child({ module: 'iam', scope: 'audit' })

/** 审计失败可观察，但不把已经生效的变更伪装成未执行，避免调用端重复提交。 */
async function observe<T>(operation: () => Promise<HaiResult<T>>, event: CreateAuditLogInput | ((result: HaiResult<T>) => CreateAuditLogInput | undefined), tx?: DmlWithTxOperations): Promise<HaiResult<T>> {
  const result = await operation()
  const fields = typeof event === 'function' ? event(result) : event
  if (!fields)
    return result
  if (tx && !result.success) {
    // 失败的事务可能已不可写；回滚后的失败审计由调用入口记录，保留原始失败。
    logger.warn('IAM transactional operation failed', { action: fields.action, resource: fields.resource, reasonCode: result.error.code })
    return result
  }
  const recorded = await audit.capture({
    ...fields,
    category: 'system',
    outcome: result.success ? 'success' : [401, 403, 409, 423, 429].includes(result.error.httpStatus ?? 500) ? 'denied' : 'failure',
    details: { ...fields.details, ...(!result.success ? { reasonCode: result.error.code } : {}) },
  }, { tx })
  if (!recorded.success) {
    logger.error('IAM event audit failed', { action: fields.action, resource: fields.resource, error: recorded.error })
    // 外部事务中的变更尚未提交，审计写入失败必须使调用者能够回滚。
    if (tx)
      return recorded
  }
  return result
}

function loginEvent(method: string, result: HaiResult<AuthResult>, context?: AuthRequestContext): CreateAuditLogInput {
  return {
    action: 'auth.login',
    resource: 'iam.auth',
    details: { method },
    // 登录结果本身已完成鉴别，不把客户端提交的标识声明当成已验证主体。
    userId: result.success ? result.data.user.id : null,
    actorSnapshot: result.success ? { id: result.data.user.id, username: result.data.user.username, displayName: result.data.user.displayName, roles: result.data.roles } : null,
    ipAddress: context?.ip,
    userAgent: context?.userAgent?.slice(0, 4096),
    requestId: context?.requestId,
  }
}

/**
 * 所有公开认证方式共用结果审计，成功令牌验证不产生重复事件。
 * @example 模块内部上下文
 * ```ts
 * function instrument(operations: AuthnOperations) { return observeAuth(operations) }
 * ```
 */
export function observeAuth(operations: AuthnOperations): AuthnOperations {
  return {
    ...operations,
    login: (credentials, context) => observe(() => operations.login(credentials, context), result => loginEvent('password', result, context)),
    loginWithOtp: (credentials, context) => observe(() => operations.loginWithOtp(credentials, context), result => loginEvent('otp', result, context)),
    loginWithLdap: (credentials, context) => observe(() => operations.loginWithLdap(credentials, context), result => loginEvent('ldap', result, context)),
    loginWithApiKey: (credentials, context) => observe(() => operations.loginWithApiKey(credentials, context), result => loginEvent('apikey', result, context)),
    registerAndLogin: (options, context) => observe(() => operations.registerAndLogin(options, context), result => loginEvent('registration', result, context)),
    logout: token => observe(() => operations.logout(token), { action: 'auth.logout', resource: 'iam.auth' }),
    sendOtp: (identifier, options) => observe(() => operations.sendOtp(identifier, options), { action: 'otp.send', resource: 'iam.auth' }),
    reauthenticate: (token, password, operation) => observe(() => operations.reauthenticate(token, password, operation), { action: 'auth.reauthenticate', resource: 'iam.auth', details: { operation } }),
    checkSensitiveOperation: (token, operation, ticket) => observe(() => operations.checkSensitiveOperation(token, operation, ticket), result => !result.success ? { action: 'auth.sensitive-denied', resource: 'iam.auth', details: { operation } } : undefined),
  }
}

/**
 * 管理端与自助入口只记录安全字段名称或非敏感策略状态，不复制业务资料。
 * @example 模块内部上下文
 * ```ts
 * function instrument(operations: UserOperations) { return observeUsers(operations) }
 * ```
 */
export function observeUsers(operations: UserOperations): UserOperations {
  return {
    ...operations,
    register: options => observe(() => operations.register(options), result => ({ action: 'user.register', resource: 'iam.users', resourceId: result.success ? result.data.user.id : undefined })),
    createUser: options => observe(() => operations.createUser(options), result => ({ action: 'user.create', resource: 'iam.users', resourceId: result.success ? result.data.user.id : undefined })),
    inviteUser: options => observe(() => operations.inviteUser(options), result => ({ action: 'user.invite', resource: 'iam.users', resourceId: result.success ? result.data.user.id : undefined })),
    updateUser: (id, data) => observe(() => operations.updateUser(id, data), { action: 'user.update', resource: 'iam.users', resourceId: id, details: { fields: Object.keys(data), ...(data.accountStatus ? { accountStatus: data.accountStatus } : {}), ...(data.accountType ? { accountType: data.accountType } : {}) } }),
    updateCurrentUser: (token, data) => observe(() => operations.updateCurrentUser(token, data), result => ({ action: 'user.profile', resource: 'iam.users', resourceId: result.success ? result.data.id : undefined, details: { fields: Object.keys(data) } })),
    deleteUser: id => observe(() => operations.deleteUser(id), { action: 'user.delete', resource: 'iam.users', resourceId: id }),
    adminResetPassword: (id, password) => observe(() => operations.adminResetPassword(id, password), { action: 'password.admin-reset', resource: 'iam.users', resourceId: id }),
    changePassword: (id, previous, next) => observe(() => operations.changePassword(id, previous, next), { action: 'password.change', resource: 'iam.users', resourceId: id }),
    changeCurrentUserPassword: (token, previous, next) => observe(() => operations.changeCurrentUserPassword(token, previous, next), { action: 'password.change', resource: 'iam.users' }),
    renewPassword: input => observe(() => operations.renewPassword(input), { action: 'password.renew', resource: 'iam.users' }),
    requestPasswordReset: (identifier, options) => observe(() => operations.requestPasswordReset(identifier, options), { action: 'password.reset-request', resource: 'iam.users' }),
    confirmPasswordReset: (token, password) => observe(() => operations.confirmPasswordReset(token, password), { action: 'password.reset-complete', resource: 'iam.users' }),
    scanInactiveAccounts: () => observe(() => operations.scanInactiveAccounts(), result => result.success && result.data === 0 ? undefined : { action: 'account.inactivity-scan', resource: 'iam.users', details: result.success ? { count: result.data } : {} }),
  }
}

/**
 * 外部事务内使用同一连接记录成功变更；回滚同步移除成功事件。
 * @example 模块内部上下文
 * ```ts
 * function instrument(operations: AuthzOperations) { return observeAuthorization(operations) }
 * ```
 */
export function observeAuthorization(operations: AuthzOperations): AuthzOperations {
  return {
    ...operations,
    assignRole: (id, roleId, tx) => observe(() => operations.assignRole(id, roleId, tx), { action: 'role.assign', resource: 'iam.user-roles', resourceId: id, details: { roleId } }, tx),
    removeRole: (id, roleId, tx) => observe(() => operations.removeRole(id, roleId, tx), { action: 'role.remove', resource: 'iam.user-roles', resourceId: id, details: { roleId } }, tx),
    syncRoles: (id, roleIds, tx) => observe(() => operations.syncRoles(id, roleIds, tx), { action: 'role.sync', resource: 'iam.user-roles', resourceId: id, details: { roleIds } }, tx),
    createRole: (input, tx) => observe(() => operations.createRole(input, tx), result => ({ action: 'role.create', resource: 'iam.roles', resourceId: result.success ? result.data.id : undefined, details: { code: input.code } }), tx),
    updateRole: (id, data, tx) => observe(() => operations.updateRole(id, data, tx), { action: 'role.update', resource: 'iam.roles', resourceId: id, details: { fields: Object.keys(data), permissionIds: data.permissionIds } }, tx),
    deleteRole: (id, tx) => observe(() => operations.deleteRole(id, tx), { action: 'role.delete', resource: 'iam.roles', resourceId: id }, tx),
    createPermission: (input, tx) => observe(() => operations.createPermission(input, tx), result => ({ action: 'permission.create', resource: 'iam.permissions', resourceId: result.success ? result.data.id : undefined, details: { code: input.code } }), tx),
    setPermissionSensitiveOperations: (id, operationIds) => observe(() => operations.setPermissionSensitiveOperations(id, operationIds), { action: 'permission.sensitive-operations', resource: 'iam.permissions', resourceId: id, details: { operations: operationIds } }),
    deletePermission: (id, tx) => observe(() => operations.deletePermission(id, tx), { action: 'permission.delete', resource: 'iam.permissions', resourceId: id }, tx),
    assignPermissionToRole: (id, permissionId, tx) => observe(() => operations.assignPermissionToRole(id, permissionId, tx), { action: 'permission.assign', resource: 'iam.role-permissions', resourceId: id, details: { permissionId } }, tx),
    removePermissionFromRole: (id, permissionId, tx) => observe(() => operations.removePermissionFromRole(id, permissionId, tx), { action: 'permission.remove', resource: 'iam.role-permissions', resourceId: id, details: { permissionId } }, tx),
  }
}

/**
 * 会话本身随机令牌不进入审计；记录主体、会话版本与撤销/刷新结果。
 * @example 模块内部上下文
 * ```ts
 * function instrument(operations: SessionOperations) { return observeSessions(operations) }
 * ```
 */
export function observeSessions(operations: SessionOperations): SessionOperations {
  return {
    ...operations,
    create: options => observe(() => operations.create(options), result => ({ action: 'session.create', resource: 'iam.sessions', resourceId: result.success ? result.data.version : options.userId })),
    delete: token => observe(() => operations.delete(token), { action: 'session.delete', resource: 'iam.sessions' }),
    deleteByUserId: id => observe(() => operations.deleteByUserId(id), result => ({ action: 'session.revoke-user', resource: 'iam.sessions', resourceId: id, details: result.success ? { count: result.data } : {} })),
    refresh: token => observe(() => operations.refresh(token), { action: 'session.refresh', resource: 'iam.sessions' }),
    revokeRefresh: token => observe(() => operations.revokeRefresh(token), { action: 'session.revoke-refresh', resource: 'iam.sessions' }),
  }
}

/**
 * 只记录 API Key ID 与授权范围，明文密钥及哈希从不进入审计输入。
 * @example 模块内部上下文
 * ```ts
 * function instrument(operations: ApiKeyOperations) { return observeApiKeys(operations) }
 * ```
 */
export function observeApiKeys(operations: ApiKeyOperations): ApiKeyOperations {
  return {
    ...operations,
    createApiKey: (userId, options) => observe(() => operations.createApiKey(userId, options), result => ({ action: 'apikey.create', resource: 'iam.apikeys', resourceId: result.success ? result.data.apiKey.id : undefined, details: { subjectId: userId, scopes: options.scopes } })),
    revokeApiKey: id => observe(() => operations.revokeApiKey(id), { action: 'apikey.revoke', resource: 'iam.apikeys', resourceId: id }),
  }
}
