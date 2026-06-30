<!--
  @component SettingsLayout
  设置页布局场景组件

  借鉴 shadcn-admin 设置页：顶部标题/描述 + 左侧分区导航 + 右侧内容区。
  分区内容由使用方通过 children 提供，导航高亮由 active 控制。

  使用 Svelte 5 Runes ($props, $derived)

  @example
  <SettingsLayout
    title="设置"
    description="管理你的账户与偏好"
    sections={[{ id: 'appearance', label: '外观', icon: 'icon-[tabler--palette]' }]}
    active={active}
    onselect={(id) => active = id}
  >
    {#if active === 'appearance'}<AppearanceSection />{/if}
  </SettingsLayout>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../../types.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import BareButton from '../../primitives/BareButton.svelte'

  type SettingsSection = {
    id: string
    label: string
    icon?: string
    /** 提供时渲染为链接（SSR 友好），否则触发 onselect */
    href?: string
  }

  const {
    title = '',
    description = '',
    sections = [],
    active = '',
    onselect,
    children,
    headerActions,
    class: className = '',
    ...restProps
  }: {
    title?: string
    description?: string
    sections?: SettingsSection[]
    active?: string
    onselect?: (id: string) => void
    children?: Snippet
    headerActions?: Snippet
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  function navItemClass(id: string): string {
    return cn(
      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      id === active
        ? 'bg-base-content/8 text-base-content'
        : 'text-base-content/60 hover:bg-base-content/5 hover:text-base-content',
    )
  }
</script>

<div {...dataAttributes} class={cn('space-y-5', className)}>
  <!-- 标题区 -->
  {#if title || description || headerActions}
    <div class='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
      <div>
        {#if title}
          <h1 class='text-xl font-semibold tracking-tight'>{title}</h1>
        {/if}
        {#if description}
          <p class='mt-0.5 text-sm text-base-content/45'>{description}</p>
        {/if}
      </div>
      {#if headerActions}
        <div class='flex items-center gap-2'>{@render headerActions()}</div>
      {/if}
    </div>
  {/if}

  <div class='grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]'>
    <!-- 左侧分区导航 -->
    {#if sections.length > 0}
      <aside class='lg:sticky lg:top-4 lg:self-start'>
        <nav class='flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible'>
          {#each sections as section (section.id)}
            {#if section.href}
              <a href={section.href} class={navItemClass(section.id)} aria-current={section.id === active ? 'page' : undefined}>
                {#if section.icon}<span class='{section.icon} size-4 shrink-0'></span>{/if}
                <span class='whitespace-nowrap'>{section.label}</span>
              </a>
            {:else}
              <BareButton type='button' class={navItemClass(section.id)} onclick={() => onselect?.(section.id)}>
                {#if section.icon}<span class='{section.icon} size-4 shrink-0'></span>{/if}
                <span class='whitespace-nowrap'>{section.label}</span>
              </BareButton>
            {/if}
          {/each}
        </nav>
      </aside>
    {/if}

    <!-- 内容区 -->
    <div class='min-w-0 space-y-5'>
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</div>
