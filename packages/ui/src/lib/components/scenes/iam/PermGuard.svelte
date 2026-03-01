<!--
  @h-ai/ui — PermGuard 权限守卫组件

  根据权限上下文条件渲染子内容。
  当用户拥有指定权限时渲染 children，否则渲染 fallback（可选）。

  @example
  ```svelte
  <PermGuard permission="user:create">
    <button>新建用户</button>
  </PermGuard>

  <PermGuard permissions={['user:update', 'user:delete']} mode="any">
    <button>操作</button>
    {#snippet fallback()}
      <span>无权限</span>
    {/snippet}
  </PermGuard>
  ```
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { usePermission } from './permission-context.svelte.js'

  interface Props {
    /** 单个权限码 */
    permission?: string
    /** 多个权限码 */
    permissions?: string[]
    /** 多权限匹配模式：any=任一即可，all=全部需要 */
    mode?: 'any' | 'all'
    /** 授权通过时渲染的内容 */
    children: Snippet
    /** 授权未通过时渲染的内容（可选） */
    fallback?: Snippet
  }

  let {
    permission,
    permissions,
    mode = 'any',
    children,
    fallback,
  }: Props = $props()

  const { hasPerm, hasAnyPerm, hasAllPerms } = usePermission()

  /** 计算是否有权限 */
  const authorized = $derived.by(() => {
    // 单权限检查
    if (permission) {
      return hasPerm(permission)
    }
    // 多权限检查
    if (permissions?.length) {
      return mode === 'all'
        ? hasAllPerms(...permissions)
        : hasAnyPerm(...permissions)
    }
    // 未指定权限，默认通过
    return true
  })
</script>

{#if authorized}
  {@render children()}
{:else if fallback}
  {@render fallback()}
{/if}
