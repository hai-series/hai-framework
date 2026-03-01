/**
 * @h-ai/ui — 权限上下文（Svelte 5）
 *
 * 提供基于 Svelte Context 的权限判断能力，支持精确匹配与通配符匹配。
 * 在根布局中通过 `setPermissionContext` 注入，子组件通过 `usePermission` 消费。
 *
 * @example
 * ```svelte
 * <!-- +layout.svelte -->
 * <script>
 *   import { setPermissionContext } from '@h-ai/ui'
 *   setPermissionContext(() => data.user?.permissions ?? [])
 * </script>
 *
 * <!-- 子组件 -->
 * <script>
 *   import { usePermission } from '@h-ai/ui'
 *   const { hasPerm, hasAnyPerm, hasAllPerms } = usePermission()
 * </script>
 * {#if hasPerm('user:create')}
 *   <button>新建用户</button>
 * {/if}
 * ```
 *
 * @module permission-context.svelte
 */

import { getContext, setContext } from 'svelte'

// ─── Context Key ───

const PERMISSION_CONTEXT_KEY = Symbol('hai-permission-context')

// ─── 权限匹配（纯函数） ───

/**
 * 判断单个权限是否匹配用户权限列表
 *
 * 支持三种匹配模式：
 * - 精确匹配：`user:create` === `user:create`
 * - 超级权限：`*` 匹配一切
 * - 通配符前缀：`user:*` 匹配 `user:create`、`user:delete` 等
 *
 * @param required - 需要检查的权限码
 * @param userPermissions - 用户拥有的权限列表
 * @returns 是否匹配
 */
export function matchPermission(required: string, userPermissions: string[]): boolean {
  for (const userPerm of userPermissions) {
    if (userPerm === required || userPerm === '*')
      return true
    if (userPerm.endsWith(':*') && required.startsWith(userPerm.slice(0, -1)))
      return true
  }
  return false
}

// ─── Context 类型 ───

/** 权限上下文内部存储 */
interface PermissionContextValue {
  /** 响应式权限列表获取函数 */
  getPermissions: () => string[]
}

/** 权限上下文消费接口 */
export interface PermissionContext {
  /** 当前用户权限列表（响应式） */
  readonly permissions: string[]
  /** 判断是否拥有指定权限 */
  hasPerm: (permission: string) => boolean
  /** 判断是否拥有任一权限 */
  hasAnyPerm: (...permissions: string[]) => boolean
  /** 判断是否拥有全部权限 */
  hasAllPerms: (...permissions: string[]) => boolean
}

// ─── Provider / Consumer ───

/**
 * 在组件树中注入权限上下文
 *
 * 应在根布局或需要权限控制的最外层组件中调用。
 * `getPermissions` 参数应返回响应式数据（如 `$derived` 值），
 * 以便权限变化时自动触发子组件更新。
 *
 * @param getPermissions - 返回当前用户权限列表的函数
 *
 * @example
 * ```svelte
 * <script>
 *   import { setPermissionContext } from '@h-ai/ui'
 *   let { data } = $props()
 *   const userPermissions = $derived(data.user?.permissions ?? [])
 *   setPermissionContext(() => userPermissions)
 * </script>
 * ```
 */
export function setPermissionContext(getPermissions: () => string[]): void {
  setContext<PermissionContextValue>(PERMISSION_CONTEXT_KEY, { getPermissions })
}

/**
 * 在子组件中消费权限上下文
 *
 * 返回一组权限判断工具函数，基于 `setPermissionContext` 注入的数据。
 * 若未注入上下文，所有权限检查均返回 `false`。
 *
 * @returns 权限上下文消费接口
 *
 * @example
 * ```svelte
 * <script>
 *   import { usePermission } from '@h-ai/ui'
 *   const { hasPerm } = usePermission()
 * </script>
 * {#if hasPerm('role:create')}
 *   <button>创建角色</button>
 * {/if}
 * ```
 */
export function usePermission(): PermissionContext {
  const ctx = getContext<PermissionContextValue | undefined>(PERMISSION_CONTEXT_KEY)

  /** 获取权限列表，未注入上下文时返回空数组 */
  const getPerms = (): string[] => ctx?.getPermissions() ?? []

  return {
    get permissions() {
      return getPerms()
    },

    hasPerm(permission: string): boolean {
      return matchPermission(permission, getPerms())
    },

    hasAnyPerm(...permissions: string[]): boolean {
      const perms = getPerms()
      return permissions.some(p => matchPermission(p, perms))
    },

    hasAllPerms(...permissions: string[]): boolean {
      const perms = getPerms()
      return permissions.every(p => matchPermission(p, perms))
    },
  }
}
