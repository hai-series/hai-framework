<!--
  =============================================================================
  @h-ai/ui - Pagination 组件
  =============================================================================
  分页组件

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, PaginationProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'
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
    ...restProps
  }: PaginationProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  // labels 优先，缺省回退到内置消息 uiM(...)

  // 计算总页数（至少 1 页，保证分页栏在空数据时仍可渲染）
  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)))

  const controlSize = $derived(size === 'xs' ? 'xs' : 'sm')
  const jumperControlSize = 'xs'
  const sizeChangerClass = $derived(size === 'xs' ? 'w-17 shrink-0' : 'w-18 shrink-0')
  const pageSizeSelectOptions = $derived(pageSizeOptions.map(opt => ({ value: String(opt), label: String(opt) })))
  const jumperWrapClass = $derived(size === 'xs' ? 'flex min-w-fit items-center gap-1.5 whitespace-nowrap' : 'flex min-w-fit items-center gap-2 whitespace-nowrap')
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

  // 统一 table 风格：首/上/下/末 导航按钮样式（等比例缩小）
  const navBtnClass = $derived(
    size === 'xs'
      ? 'inline-flex h-6 w-6 items-center justify-center rounded-md border border-base-content/12 text-base-content/55 transition-colors hover:bg-base-content/5 hover:text-base-content disabled:pointer-events-none disabled:opacity-40'
      : 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-base-content/12 text-base-content/55 transition-colors hover:bg-base-content/5 hover:text-base-content disabled:pointer-events-none disabled:opacity-40',
  )
  const navIconClass = $derived(size === 'xs' ? 'size-3.5' : 'size-3.5')
  const tableTextClass = $derived(size === 'xs' ? 'text-xs text-base-content/60' : 'text-sm text-base-content/60')
  const rowGapClass = $derived(size === 'xs' ? 'flex flex-wrap items-center gap-3 sm:gap-4' : 'flex flex-wrap items-center gap-4 sm:gap-6')
  const pageInfoText = $derived(
    (labels.pageInfo ?? uiM('pagination_page_info'))
      .replace('{page}', String(page))
      .replace('{total}', String(totalPages)),
  )
</script>

<div {...dataAttributes} class={cn('flex flex-wrap items-center justify-between gap-4', className)}>
  {#if showTotal}
    <span class={tableTextClass}>
      {(labels.total ?? uiM('pagination_total')).replace('{count}', String(total))}
    </span>
  {:else}
    <span></span>
  {/if}

  <div class={rowGapClass}>
    {#if showSizeChanger}
      <div class='flex items-center gap-2'>
        <span class={tableTextClass}>{labels.rowsPerPage ?? uiM('pagination_rows_per_page')}</span>
        <div class={sizeChangerClass}>
          <Select
            size={controlSize}
            value={String(pageSize)}
            options={pageSizeSelectOptions}
            onchange={handlePageSizeChange}
          />
        </div>
      </div>
    {/if}

    <span class={tableTextClass}>{pageInfoText}</span>

    <div class='flex items-center gap-1'>
      <BareButton class={navBtnClass} disabled={page === 1} onclick={() => goToPage(1)} ariaLabel='First page'>
        <span class={cn('icon-[tabler--chevrons-left]', navIconClass)}></span>
      </BareButton>
      <BareButton class={navBtnClass} disabled={page === 1} onclick={() => goToPage(page - 1)} ariaLabel='Previous page'>
        <span class={cn('icon-[tabler--chevron-left]', navIconClass)}></span>
      </BareButton>
      <BareButton class={navBtnClass} disabled={page === totalPages} onclick={() => goToPage(page + 1)} ariaLabel='Next page'>
        <span class={cn('icon-[tabler--chevron-right]', navIconClass)}></span>
      </BareButton>
      <BareButton class={navBtnClass} disabled={page === totalPages} onclick={() => goToPage(totalPages)} ariaLabel='Last page'>
        <span class={cn('icon-[tabler--chevrons-right]', navIconClass)}></span>
      </BareButton>
    </div>

    {#if showJumper}
      <div class={jumperWrapClass}>
        <span class={tableTextClass}>{labels.jumpTo ?? uiM('pagination_jump_to')}</span>
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
        <span class={tableTextClass}>{labels.page ?? uiM('pagination_page')}</span>
      </div>
    {/if}
  </div>
</div>
