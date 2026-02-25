<!--
  =============================================================================
  @h-ai/ui - Pagination 组件
  =============================================================================
  分页组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { PaginationProps } from '../../types.js'
  import { cn, getSizeClass } from '../../utils.js'
  import Input from '../primitives/Input.svelte'
  import BareButton from '../primitives/BareButton.svelte'
  
  import { m } from '../../messages.js'

  
  let {
    page = $bindable(1),
    total,
    pageSize = 10,
    size = 'md',
    showTotal = true,
    showJumper = false,
    labels = {},
    class: className = '',
    onchange,
  }: PaginationProps = $props()
  
  // labels 优先，缺省回退到内置消息 m(...)
  
  // 计算总页数
  const totalPages = $derived(Math.ceil(total / pageSize))
  
  // 生成页码列表
  const pages = $derived(() => {
    const result: (number | string)[] = []
    const maxVisible = 7
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        result.push(i)
      }
    } else {
      // 始终显示第一页
      result.push(1)
      
      if (page > 3) {
        result.push('...')
      }
      
      // 中间页码
      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      
      for (let i = start; i <= end; i++) {
        result.push(i)
      }
      
      if (page < totalPages - 2) {
        result.push('...')
      }
      
      // 始终显示最后一页
      result.push(totalPages)
    }
    
    return result
  })
  
  const joinClass = $derived(
    cn(
      'join',
      className,
    )
  )
  
  const btnClass = $derived(
    cn(
      'join-item btn',
      getSizeClass(size),
    )
  )
  
  function goToPage(p: number) {
    if (p >= 1 && p <= totalPages && p !== page) {
      page = p
      onchange?.(p)
    }
  }
  
  let jumperValue = $state('')
  
  function handleJump() {
    const p = parseInt(jumperValue, 10)
    if (!isNaN(p)) {
      goToPage(p)
      jumperValue = ''
    }
  }
</script>

<div class="flex items-center gap-4">
  {#if showTotal}
      <span class="text-sm text-base-content/70">
      {(labels.total ?? m('pagination_total')).replace('{count}', String(total))}
    </span>
  {/if}
  
  <div class={joinClass}>
    <BareButton
      class={btnClass}
      disabled={page === 1}
      onclick={() => goToPage(page - 1)}
    >
      «
    </BareButton>
    
    {#each pages() as p}
      {#if typeof p === 'number'}
        <BareButton
          class={cn(btnClass, page === p && 'btn-active')}
          onclick={() => goToPage(p)}
        >
          {p}
        </BareButton>
      {:else}
        <BareButton class={cn(btnClass, 'btn-disabled')} disabled>...</BareButton>
      {/if}
    {/each}
    
    <BareButton
      class={btnClass}
      disabled={page === totalPages}
      onclick={() => goToPage(page + 1)}
    >
      »
    </BareButton>
  </div>
  
  {#if showJumper}
    <div class="flex items-center gap-2">
      <span class="text-sm">{labels.jumpTo ?? m('pagination_jump_to')}</span>
      <Input
        type="number"
        size="sm"
        class="w-16"
        min={1}
        max={totalPages}
        bind:value={jumperValue}
        onkeydown={(e: KeyboardEvent & { currentTarget: HTMLInputElement }) => e.key === 'Enter' && handleJump()}
      />
      <span class="text-sm">{labels.page ?? m('pagination_page')}</span>
    </div>
  {/if}
</div>
