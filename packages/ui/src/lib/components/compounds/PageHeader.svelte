<!--
  @component PageHeader
  页面头部组件，包含标题、描述和操作按钮区域。

  @prop {string} title - 页面标题
  @prop {string} description - 页面描述
  @prop {Snippet} actions - 右侧操作按钮插槽

  @example
  <PageHeader title="用户管理" description="管理系统用户">
    {#snippet actions()}
      <Button onclick={createUser}>
        <span class='icon-[tabler--plus] size-4'></span>
        新建用户
      </Button>
    {/snippet}
  </PageHeader>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    description?: string
    actions?: Snippet
    class?: string
  }

  let { title, description, actions, class: className = '' }: Props = $props()
</script>

<div class='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 {className}'>
  <div>
    <h1 class='text-xl font-semibold tracking-tight'>{title}</h1>
    {#if description}
      <p class='text-sm text-base-content/45 mt-0.5'>{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class='flex items-center gap-2'>
      {@render actions()}
    </div>
  {/if}
</div>
