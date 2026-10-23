<!--
  @component PermGuard
  @h-ai/ui — PermGuard 权限守卫组件

  根据权限上下文条件渲染子内容。
  当用户拥有指定权限时渲染 children，否则渲染 fallback（可选）。

  @example
  ```ts
  import { mount, unmount, createRawSnippet } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { PermGuard } from '@h-ai/ui'
  const props: ComponentProps<typeof PermGuard> = { permission: 'user:read', children: createRawSnippet(() => ({ render: () => "<span>用户列表</span>" })) }
  const component = mount(PermGuard, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { usePermission } from './permission-context.svelte.js'

  /**
   * PermGuard 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount, createRawSnippet } from 'svelte'
   * import type { ComponentProps } from 'svelte'
   * import { PermGuard } from '@h-ai/ui'
   * const props: ComponentProps<typeof PermGuard> = { permission: 'user:read', children: createRawSnippet(() => ({ render: () => "<span>用户列表</span>" })) }
   * const component = mount(PermGuard, { target: document.body, props })
   * await unmount(component)
   * ```
   */
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

  const {
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
