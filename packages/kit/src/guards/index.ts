/**
 * =============================================================================
 * @hai/kit - Guards 导出
 * =============================================================================
 */

export { authGuard, type AuthGuardConfig } from './auth.js'
export { roleGuard, type RoleGuardConfig } from './role.js'
export { permissionGuard, type PermissionGuardConfig } from './permission.js'
export { allGuards, anyGuard, notGuard, conditionalGuard } from './compose.js'
