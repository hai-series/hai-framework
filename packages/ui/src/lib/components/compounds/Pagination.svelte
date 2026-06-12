<!--
  =============================================================================
  @h-ai/ui - Pagination 组件
  =============================================================================
  分页组件

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang='ts'>
  import type { PaginationProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getSizeClass } from '../../utils.js'
  import BareButton from '../primitives/BareButton.svelte'

  import Input from '../primitives/Input.svelte'
  import Select from '../primitives/Select.svelte'

  let {
    page = $bindable(1),
    total,
    pageSize = 10,
    size = 'md',
    showTotal = true,
    showJumper = false,
    showSizeChanger = false,
    pageSizeOptions = [10, 20, 50, 100],
    labels = {},
    class: className = '',
    onchange,
    onpagesizechange,
  }: PaginationProps = $props()

  // labels 优先，缺省回退到内置消息 uiM(...)

  // 计算总页数（至少 1 页，保证分页栏在空数据时仍可渲染）
  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)))

  // 生成页码列表
  const pages = $derived(() => {
    const result: (number | string)[] = []
    const maxVisible = 7

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        result.push(i)
      }
    }
    else {
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
    ),
  )

  const btnClass = $derived(
    cn(
      'join-item btn',
      getSizeClass(size),
    ),
  )

  const controlSize = $derived(size === 'xs' ? 'xs' : 'sm')
  const jumperControlSize = 'xs'
  const wrapperClass = $derived(size === 'xs' ? 'flex flex-wrap items-center justify-center gap-1.5 text-xs' : 'flex flex-wrap items-center justify-center gap-2.5 text-sm')
  const totalClass = $derived(size === 'xs' ? 'text-xs text-base-content/70' : 'text-sm text-base-content/70')
  const sizeChangerClass = $derived(size === 'xs' ? 'w-22 shrink-0' : 'w-24 shrink-0')
  const jumperWrapClass = $derived(size === 'xs' ? 'flex min-w-fit items-center gap-1.5 whitespace-nowrap' : 'flex min-w-fit items-center gap-1.5 whitespace-nowrap')
  const jumperInputClass = $derived(
    size === 'xs'
      ? 'w-[2.25rem] shrink-0 [&>.fieldset]:m-0 [&>.fieldset]:min-w-0'
      : 'w-[2.5rem] shrink-0 [&>.fieldset]:m-0 [&>.fieldset]:min-w-0',
  )

  function goToPage(p: number) {
    if (p >= 1 && p <= totalPages && p !== page) {
      page = p
      onchange?.(p)
    }
  }

  let jumperValue = $state('')

  function handleJump() {
    const p = Number.parseInt(jumperValue, 10)
    if (!Number.isNaN(p)) {
      goToPage(p)
      jumperValue = ''
    }
  }

  function handlePageSizeChange(value: string) {
    const next = Number.parseInt(value, 10)
    if (!Number.isNaN(next) && next !== pageSize) {
      onpagesizechange?.(next)
    }
  }
</script>

<div class={wrapperClass}>
  {#if showTotal}
    <span class={totalClass}>
      {(labels.total ?? uiM('pagination_total')).replace('{count}', String(total))}
    </span>
  {/if}

  {#if showSizeChanger}
    <div class={sizeChangerClass}>
      <Select
        size={controlSize}
        value={String(pageSize)}
        onchange={handlePageSizeChange}
      >
        {#each pageSizeOptions as opt (opt)}
          <option value={String(opt)}>
            {(labels.pageSize ?? uiM('pagination_page_size')).replace('{size}', String(opt))}
          </option>
        {/each}
      </Select>
    </div>
  {/if}

  <div class={joinClass}>
    <BareButton
      class={btnClass}
      disabled={page === 1}
      onclick={() => goToPage(page - 1)}
    >
      «
    </BareButton>

    {#each pages() as p, index (typeof p === 'number' ? p : `ellipsis-${index}`)}
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
    <div class={jumperWrapClass}>
      <span class={totalClass}>{labels.jumpTo ?? uiM('pagination_jump_to')}</span>
      <div class={jumperInputClass}>
        <Input
          type='number'
          size={jumperControlSize}
          class='h-7 w-full rounded-md [&_input]:px-1.5 [&_input]:text-center [&_input]:text-[12px]'
          min={1}
          max={totalPages}
          bind:value={jumperValue}
          onkeydown={(e: KeyboardEvent & { currentTarget: HTMLInputElement }) => e.key === 'Enter' && handleJump()}
        />
      </div>
      <span class={totalClass}>{labels.page ?? uiM('pagination_page')}</span>
    </div>
  {/if}
</div>
