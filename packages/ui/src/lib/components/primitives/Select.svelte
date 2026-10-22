<!--
  @component Select
  =============================================================================
  @h-ai/ui - Select 组件
  =============================================================================
  下拉选择框组件（全自定义实现，统一弹出层样式）

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  支持 clearable（可清空）和 filterable（可筛选）属性
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Select } from '@h-ai/ui'
  const props: ComponentProps<typeof Select> = { options: [{ value: 'active', label: '启用' }], value: 'active' }
  const component = mount(Select, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts' generics="T = string">
  import type { DataAttributes, SelectProps } from '../../types.js'
  import { tick, untrack } from 'svelte'
  import { getFormFieldContext } from '../../internal/form-context.js'
  import { createControlValidation, resolveFormText } from '../../internal/form-validation.svelte.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes, portal } from '../../utils.js'
  import { getFormControlSizeClasses } from '../control-size.js'

  let {
    value = $bindable<T>(),
    options,
    placeholder = '',
    size = 'md',
    disabled = false,
    required = false,
    clearable = false,
    filterable = false,
    error = '',
    validationMessage = '',
    class: className = '',
    id,
    name,
    onchange,
    ...restProps
  }: SelectProps<T> & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const field = getFormFieldContext()
  const uniqueId = $props.id()
  const controlId = $derived(id ?? field?.controlId ?? `${uniqueId}-control`)
  const messageId = `${uniqueId}-error`
  const validation = createControlValidation(() => validationMessage)
  const localError = $derived(resolveFormText(error) || validation.message)
  const effectiveError = $derived(field?.error || localError)
  let nativeSelect: HTMLSelectElement | undefined = $state()
  // 独立保存原生选中值，筛选输入的文字不能代替表单实际选项。
  const nativeValue = $derived(value === undefined || value === null ? '' : String(value))
  $effect(() => {
    void options
    void required
    void disabled
    if (nativeSelect) {
      nativeSelect.value = nativeValue
      untrack(() => validation.input(nativeSelect!))
    }
  })
  $effect(() => {
    if (nativeSelect)
      nativeSelect.setCustomValidity(validation.message)
  })
  let inputRef: HTMLInputElement | undefined = $state()
  let dropdownRef: HTMLDivElement | undefined = $state()
  let triggerRef: HTMLDivElement | undefined = $state()
  let listboxRef: HTMLUListElement | undefined = $state()
  let isDropdownOpen = $state(false)
  let filterText = $state('')
  let isHovered = $state(false)
  // 下拉层定位样式（portal 到 body，用 fixed 逃逸 overflow/stacking）
  let dropdownStyle = $state('')
  /** portal 移动节点后用于二次测量的动画帧句柄，关闭时必须取消避免过期写入。 */
  let dropdownPositionFrame: number | undefined = $state()

  const sizeClasses = $derived(getFormControlSizeClasses(size))

  // 选项文字尺寸
  const optionTextClass = $derived(
    size === 'xs'
      ? 'text-xs'
      : size === 'lg'
      ? 'text-base'
      : size === 'xl'
      ? 'text-lg'
      : 'text-sm',
  )

  // 获取当前选中的标签
  const selectedLabel = $derived(() => {
    if (!options || value === undefined || value === null)
      return ''
    const selected = options.find(opt => opt.value === value)
    return selected ? selected.label : ''
  })

  // 过滤后的选项
  const filteredOptions = $derived(() => {
    if (!options)
      return []
    if (!filterable || !filterText)
      return options
    return options.filter(opt =>
      opt.label.toLowerCase().includes(filterText.toLowerCase()),
    )
  })

  const wrapperClass = $derived(
    cn(
      'relative flex w-full min-w-0 items-center rounded-lg border bg-base-100 cursor-pointer',
      sizeClasses.control,
      effectiveError
        ? 'border-error/60 focus-within:ring-2 focus-within:ring-error/15'
        : isDropdownOpen
        ? 'border-primary/50 ring-2 ring-primary/10'
        : 'border-base-content/15 hover:border-base-content/25 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
      'transition-[border-color,box-shadow] duration-150',
      disabled && 'opacity-50 cursor-not-allowed',
      className,
    ),
  )

  const inputClass = $derived(
    cn(
      'flex-1 min-w-0 bg-transparent outline-none border-none',
      'focus:outline-none focus:ring-0 focus:shadow-none',
      'placeholder:text-base-content/40',
      effectiveError && 'text-error',
    ),
  )

  // 点击外部关闭下拉框（下拉层已 portal 到 body，需同时排除 listbox）
  $effect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const inTrigger = dropdownRef?.contains(target) ?? false
      const inListbox = listboxRef?.contains(target) ?? false
      if (!inTrigger && !inListbox) {
        isDropdownOpen = false
        filterText = ''
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }

    return undefined
  })

  // 计算下拉层位置（fixed，基于触发器视口坐标；空间不足时向上翻转）
  function updateDropdownPosition() {
    if (!triggerRef)
      return
    const rect = triggerRef.getBoundingClientRect()
    const gap = 4
    const maxHeight = 240
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < maxHeight + gap && rect.top > spaceBelow
    const vertical = openUp
      ? `bottom:${Math.round(window.innerHeight - rect.top + gap)}px`
      : `top:${Math.round(rect.bottom + gap)}px`
    dropdownStyle = `position:fixed;left:${Math.round(rect.left)}px;width:${Math.round(rect.width)}px;${vertical};z-index:1200;`
  }

  /**
   * 在 portal 完成节点移动和父级 flex 布局收敛后重算一次浮层坐标。
   *
   * 首次打开时，Svelte 创建浮层、portal 将其移入 body 与分页栏的 flex 尺寸更新可能落在同一渲染批次；
   * 立即测量用于避免首帧无定位，下一帧复测则保证 fixed 坐标只基于最终的触发器视口位置。
   */
  async function scheduleSettledDropdownPosition(): Promise<void> {
    await tick()
    if (!isDropdownOpen) {
      return
    }

    dropdownPositionFrame = window.requestAnimationFrame(() => {
      dropdownPositionFrame = undefined
      if (isDropdownOpen) {
        updateDropdownPosition()
      }
    })
  }

  // 打开时定位并跟随滚动/缩放更新
  $effect(() => {
    if (!isDropdownOpen)
      return
    updateDropdownPosition()
    void scheduleSettledDropdownPosition()
    const scrollOpts = { passive: true, capture: true } as const
    window.addEventListener('scroll', updateDropdownPosition, scrollOpts)
    window.addEventListener('resize', updateDropdownPosition)
    return () => {
      if (dropdownPositionFrame !== undefined) {
        window.cancelAnimationFrame(dropdownPositionFrame)
        dropdownPositionFrame = undefined
      }
      window.removeEventListener('scroll', updateDropdownPosition, scrollOpts)
      window.removeEventListener('resize', updateDropdownPosition)
    }
  })

  function handleWrapperClick() {
    if (disabled)
      return

    if (!isDropdownOpen) {
      isDropdownOpen = true
    }

    if (filterable) {
      // filterable 模式下点击后始终聚焦输入框，保持下拉可筛状态
      setTimeout(() => inputRef?.focus(), 0)
    }
  }

  function handleOptionSelect(optionValue: T, optionDisabled?: boolean) {
    if (optionDisabled)
      return
    value = optionValue
    isDropdownOpen = false
    filterText = ''
    onchange?.(optionValue)
  }

  function handleFilterInput(e: Event & { currentTarget: HTMLInputElement }) {
    filterText = e.currentTarget.value
    if (!isDropdownOpen) {
      isDropdownOpen = true
    }
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      isDropdownOpen = false
      filterText = ''
      inputRef?.blur()
    }
    else if (e.key === 'Enter') {
      // 回车选中第一个匹配项
      const opts = filteredOptions()
      if (opts.length > 0 && !opts[0].disabled) {
        handleOptionSelect(opts[0].value)
      }
    }
    else if (e.key === 'Backspace' && filterText === '' && clearable && value) {
      value = undefined as T
      onchange?.(undefined as T)
    }
  }

  function handleClear(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    value = undefined as T
    filterText = ''
    onchange?.(undefined as T)
  }

  function handleFocusOut(event: FocusEvent) {
    const next = event.relatedTarget
    // 选项通过 portal 渲染，触发器与选项之间的焦点移动仍属于同一字段。
    if (next instanceof Node && (dropdownRef?.contains(next) || listboxRef?.contains(next)))
      return
    if (nativeSelect)
      validation.validate(nativeSelect)
    isDropdownOpen = false
    filterText = ''
  }

  // 判断是否显示清除按钮
  const showClear = $derived(clearable && value !== undefined && value !== null && value !== '' && isHovered)
</script>

<div
  {...dataAttributes}
  class='fieldset w-full min-w-0'
  bind:this={dropdownRef}
  onmouseenter={() => isHovered = true}
  onmouseleave={() => isHovered = false}
  onfocusout={handleFocusOut}
>
  <select
    bind:this={nativeSelect}
    class='sr-only'
    tabindex='-1'
    aria-hidden='true'
    {name}
    {required}
    {disabled}
    value={nativeValue}
    oninvalid={(e) => {
      e.preventDefault()
      validation.validate(e.currentTarget)
      inputRef?.focus()
    }}
  >
    <option value=''></option>
    {#each options ?? [] as option (String(option.value))}
      {#if String(option.value) !== ''}
        <option value={String(option.value)} disabled={option.disabled}>{option.label}</option>
      {/if}
    {/each}
  </select>
  <div
    class={wrapperClass}
    bind:this={triggerRef}
    onclick={handleWrapperClick}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleWrapperClick()
      }
    }}
    role='presentation'
  >
    {#if filterable}
      <!-- 可筛选模式：可输入的 input -->
      <input
        bind:this={inputRef}
        id={controlId}
        aria-invalid={effectiveError ? true : undefined}
        aria-describedby={[field?.messageId, localError && !field?.error ? messageId : ''].filter(Boolean).join(' ') || undefined}
        type='text'
        class={inputClass}
        {disabled}
        {placeholder}
        value={isDropdownOpen ? filterText : selectedLabel()}
        oninput={handleFilterInput}
        onkeydown={handleInputKeydown}
        onfocus={() => {
          if (!disabled && !isDropdownOpen)
            isDropdownOpen = true
        }}
        role='combobox'
        aria-haspopup='listbox'
        aria-autocomplete='list'
        aria-controls='{controlId}-listbox'
        aria-expanded={isDropdownOpen}
      />
    {:else}
      <!-- 普通模式：只读 input 显示选中值 -->
      <input
        bind:this={inputRef}
        id={controlId}
        aria-invalid={effectiveError ? true : undefined}
        aria-describedby={[field?.messageId, localError && !field?.error ? messageId : ''].filter(Boolean).join(' ') || undefined}
        type='text'
        class={inputClass}
        readonly
        {disabled}
        {placeholder}
        value={selectedLabel()}
        onkeydown={handleInputKeydown}
        onfocus={() => {
          if (!disabled)
            isDropdownOpen = true
        }}
        role='combobox'
        aria-haspopup='listbox'
        aria-controls='{controlId}-listbox'
        aria-expanded={isDropdownOpen}
      />
    {/if}

    <!-- 右侧图标区域 -->
    <div class='flex items-center shrink-0'>
      {#if showClear}
        <button
          type='button'
          class='flex items-center justify-center w-5 h-5 rounded-full hover:bg-base-content/10 transition-colors'
          onclick={handleClear}
          tabindex='-1'
          aria-label={uiM('select_clear')}
        >
          <svg xmlns='http://www.w3.org/2000/svg' class='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
          </svg>
        </button>
      {:else}
        <svg
          class={cn('h-4 w-4 text-base-content/40 transition-transform duration-200', isDropdownOpen && 'rotate-180')}
          xmlns='http://www.w3.org/2000/svg'
          viewBox='0 0 20 20'
          fill='currentColor'
        >
          <path fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd' />
        </svg>
      {/if}
    </div>

    <!-- 下拉选项列表（portal 到 body，fixed 定位，逃逸 overflow/stacking 裁剪） -->
    {#if isDropdownOpen}
      <ul
        bind:this={listboxRef}
        use:portal
        id='{controlId}-listbox'
        class='max-h-60 overflow-auto rounded-xl border border-base-content/10 bg-base-100 p-1.5 shadow-xl shadow-base-content/10'
        style={dropdownStyle}
        role='listbox'
        onfocusout={handleFocusOut}
      >
        {#each filteredOptions() as option (String(option.value))}
          <li
            class={cn(
              'flex cursor-pointer items-center rounded-lg px-3 py-2.5 transition-all duration-150',
              optionTextClass,
              option.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-base-content/5 active:bg-base-content/8',
              value === option.value && 'bg-primary/10 text-primary font-semibold',
            )}
            role='option'
            aria-selected={value === option.value}
            aria-disabled={option.disabled}
            onclick={(e) => {
              e.stopPropagation()
              handleOptionSelect(option.value, option.disabled)
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleOptionSelect(option.value, option.disabled)
              }
            }}
            tabindex={option.disabled ? -1 : 0}
          >
            {option.label}
          </li>
        {:else}
          <li class={cn('px-3 py-3 text-base-content/40 text-center', optionTextClass)}>
            {uiM('select_no_match')}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if localError && !field?.error}
    <p id={messageId} class='mt-1.5 text-xs text-error leading-relaxed break-words' aria-live='polite'>{localError}</p>
  {/if}
</div>
