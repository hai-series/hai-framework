/**
 * =============================================================================
 * @hai/kit - Guards 导出
 * =============================================================================
 */

export { authGuard, type AuthGuardConfig } from './auth.js'
export { allGuards, anyGuard, conditionalGuard, notGuard } from './compose.js'
export { permissionGuard, type PermissionGuardConfig } from './permission.js'
export { roleGuard, type RoleGuardConfig } from './role.js'
