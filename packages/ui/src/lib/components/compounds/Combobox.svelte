<!--
  @component Combobox
  可搜索下拉选择组件，基于 Bits UI headless + DaisyUI 样式。
  支持单选和多选模式，带搜索过滤、键盘导航、无障碍支持。
  多选模式下以标签形式展示已选项。

  @prop {Option[]} options - 选项列表
  @prop {string | string[]} value - 选中值（双向绑定，单选为 string，多选为 string[]）
  @prop {boolean} multiple - 是否多选模式
  @prop {string} placeholder - 输入框占位符
  @prop {Size} size - 输入框尺寸
  @prop {boolean} disabled - 是否禁用
  @prop {string} error - 错误消息
  @prop {string} label - 表单标签
  @prop {string} class - 自定义类名
  @prop {function} onchange - 值变更回调

  @example 单选
  <Combobox
    options={[
      { value: 'svelte', label: 'Svelte' },
      { value: 'react', label: 'React' },
    ]}
    bind:value={framework}
    placeholder="搜索框架..."
  />

  @example 多选
  <Combobox
    options={skills}
    bind:value={selectedSkills}
    multiple
    placeholder="搜索技能..."
  />
-->
<script lang='ts'>
  import type { DataAttributes, Size } from '../../types.js'
  import { Combobox } from 'bits-ui'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import { getFormControlSizeClasses } from '../control-size.js'
  import BareButton from '../primitives/BareButton.svelte'

  /** 选项定义 */
  interface Option {
    /** 选项值 */
    value: string
    /** 显示标签 */
    label: string
    /** 是否禁用 */
    disabled?: boolean
    /** 描述文本（仅在多选模式下展示） */
    description?: string
  }

  interface Props {
    /** 选项列表 */
    options: Option[]
    /** 选中值（双向绑定，单选为 string，多选为 string[]） */
    value?: string | string[]
    /** 是否多选模式 */
    multiple?: boolean
    /** 输入框占位符 */
    placeholder?: string
    /** 尺寸 */
    size?: Size
    /** 是否禁用 */
    disabled?: boolean
    /** 错误消息 */
    error?: string
    /** 表单标签 */
    label?: string
    /** 自定义类名 */
    class?: string
    /** 值变更回调 */
    onchange?: (value: string | string[]) => void
  }

  let {
    options,
    value = $bindable(),
    multiple = false,
    placeholder = '',
    size = 'md',
    disabled = false,
    error,
    label: fieldLabel,
    class: className = '',
    onchange,
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const sizeClasses = $derived(getFormControlSizeClasses(size))
  // 为未提供 value 时设置初始默认值（仅在初始化时执行一次）
  // 统一以空字符串初始化，避免在初始化阶段捕获 multiple 的初始值。
  // 多选模式会通过 multiVal 派生为 [] 传给 Combobox.Root。
  if (value === undefined) {
    value = ''
  }

  // ─── 统一视觉样式（与 Select 对齐：rounded-lg / 柔和边框 / focus ring） ───
  const controlStateClass = $derived(
    error
      ? 'border-error/60 focus-within:ring-2 focus-within:ring-error/15'
      : 'border-base-content/15 hover:border-base-content/25 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
  )
  const contentClass = 'z-[1200] mt-1.5 max-h-60 w-(--bits-combobox-anchor-width) overflow-y-auto rounded-xl border border-base-content/10 bg-base-100 p-1.5 shadow-xl shadow-base-content/10'
  const itemClass = 'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-base-content/5 data-highlighted:bg-base-content/5 data-disabled:cursor-not-allowed data-disabled:opacity-40'

  let searchValue = $state('')
  let open = $state(false)
  let inputRef = $state<HTMLInputElement | null>(null)

  /** 根据搜索关键词过滤选项 */
  const filteredOptions = $derived(
    searchValue === ''
      ? options
      : options.filter((opt) => {
        const keyword = searchValue.toLowerCase()
        const inLabel = opt.label.toLowerCase().includes(keyword)
        const inDescription = opt.description?.toLowerCase().includes(keyword) ?? false
        return inLabel || inDescription
      }),
  )

  /** 单选模式：输入框显示值（打开时显示搜索词，关闭时显示选中项标签） */
  const singleInputValue = $derived.by(() => {
    if (open)
      return searchValue
    return options.find(o => o.value === value)?.label ?? ''
  })

  /** 多选模式：输入框始终显示搜索词 */
  const multiInputValue = $derived(searchValue)

  /** 多选模式下已选中的选项列表 */
  const selectedOptions = $derived(
    Array.isArray(value)
      ? options.filter(opt => (value as string[]).includes(opt.value))
      : [],
  )

  /** 多选模式：提供给 Combobox.Root 的类型安全值 */
  const multiVal = $derived(Array.isArray(value) ? value as string[] : [])

  /** 单选模式：提供给 Combobox.Root 的类型安全值 */
  const singleVal = $derived(typeof value === 'string' ? value : '')

  function syncInputElementValue() {
    if (!inputRef)
      return
    const nextValue = multiple ? multiInputValue : singleInputValue
    if (inputRef.value !== nextValue) {
      inputRef.value = nextValue
    }
  }

  $effect(() => {
    syncInputElementValue()
  })

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    searchValue = e.currentTarget.value
    if (!open)
      open = true
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen)
      searchValue = ''
  }

  function handleMultiValueChange(v: string[]) {
    value = v
    onchange?.(v)
    setTimeout(() => {
      searchValue = ''
      syncInputElementValue()
    }, 0)
  }

  function handleSingleValueChange(v: string) {
    value = v
    onchange?.(v)
    setTimeout(() => {
      searchValue = ''
      syncInputElementValue()
    }, 0)
  }

  /** 多选模式下移除某个已选项 */
  function removeItem(val: string, event: MouseEvent) {
    event.stopPropagation()
    if (!Array.isArray(value))
      return
    const newValue = (value as string[]).filter(v => v !== val)
    value = newValue
    onchange?.(newValue)
  }
</script>

<div {...dataAttributes} class='fieldset w-full {className}'>
  {#if fieldLabel}
    <legend class='fieldset-legend font-medium'>{fieldLabel}</legend>
  {/if}

  {#if multiple}
    <!-- 多选模式 -->
    <Combobox.Root
      type='multiple'
      items={filteredOptions}
      inputValue={multiInputValue}
      value={multiVal}
      bind:open
      {disabled}
      onOpenChange={handleOpenChange}
      onValueChange={handleMultiValueChange}
    >
      <div class='relative'>
        <div
          class={cn(
            'rounded-lg border bg-base-100 flex flex-wrap gap-1.5 items-center py-1 pl-2.5 pr-9 transition-[border-color,box-shadow] duration-150',
            sizeClasses.minHeight,
            disabled ? 'opacity-50 cursor-not-allowed bg-base-200' : 'cursor-text',
            controlStateClass,
          )}
        >
          {#each selectedOptions as opt (opt.value)}
            <span class='inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-sm text-primary'>
              <span class='truncate max-w-32'>{opt.label}</span>
              {#if !disabled}
                <BareButton
                  type='button'
                  class='rounded p-0.5 transition-colors hover:bg-primary/20'
                  onclick={(e: MouseEvent) => removeItem(opt.value, e)}
                  ariaLabel="{uiM('combobox_remove')} {opt.label}"
                >
                  <span class='icon-[tabler--x] size-3'></span>
                </BareButton>
              {/if}
            </span>
          {/each}

          <Combobox.Input
            bind:ref={inputRef}
            class={cn('flex-1 min-w-20 bg-transparent py-0.5 outline-none placeholder:text-base-content/40', sizeClasses.spacing)}
            placeholder={selectedOptions.length === 0 ? placeholder : ''}
            {disabled}
            oninput={handleInput}
            onfocus={() => {
              if (!disabled)
                open = true
            }}
          />
        </div>

        <Combobox.Trigger
          class='absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-base-content/40 transition-colors hover:text-base-content/70'
        >
          <span class="icon-[tabler--chevron-down] size-4 transition-transform {open ? 'rotate-180' : ''}"></span>
        </Combobox.Trigger>
      </div>

      <Combobox.Portal>
        <Combobox.Content
          class={contentClass}
          sideOffset={4}
        >
          {#if filteredOptions.length === 0}
            <div class='px-3 py-2.5 text-sm text-base-content/50'>
              {uiM('combobox_no_match')}
            </div>
          {:else}
            {#each filteredOptions as opt (opt.value)}
              <Combobox.Item
                value={opt.value}
                label={opt.label}
                disabled={opt.disabled}
                class={itemClass}
              >
                {#snippet children({ selected })}
                  <span class="flex size-4 shrink-0 items-center justify-center rounded border border-base-content/30 {selected ? 'border-primary bg-primary' : ''}">
                    {#if selected}
                      <span class='icon-[tabler--check] size-3 text-primary-content'></span>
                    {/if}
                  </span>
                  <div class='flex-1 min-w-0'>
                    <span>{opt.label}</span>
                    {#if opt.description}
                      <div class='truncate text-xs text-base-content/50'>{opt.description}</div>
                    {/if}
                  </div>
                {/snippet}
              </Combobox.Item>
            {/each}
          {/if}
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox.Root>
  {:else}
    <!-- 单选模式 -->
    <Combobox.Root
      type='single'
      items={filteredOptions}
      inputValue={singleInputValue}
      value={singleVal}
      bind:open
      {disabled}
      onOpenChange={handleOpenChange}
      onValueChange={handleSingleValueChange}
    >
      <div class='relative'>
        <Combobox.Input
          bind:ref={inputRef}
          class={cn(
            'w-full rounded-lg border bg-base-100 pr-9 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-base-content/40',
            sizeClasses.control,
            controlStateClass,
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          {placeholder}
          {disabled}
          oninput={handleInput}
          onfocus={() => {
            if (!disabled)
              open = true
          }}
        />
        <Combobox.Trigger
          class='absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-base-content/40 transition-colors hover:text-base-content/70'
        >
          <span class="icon-[tabler--chevron-down] size-4 transition-transform {open ? 'rotate-180' : ''}"></span>
        </Combobox.Trigger>
      </div>

      <Combobox.Portal>
        <Combobox.Content
          class={contentClass}
          sideOffset={4}
        >
          {#if filteredOptions.length === 0}
            <div class='px-3 py-2.5 text-sm text-base-content/50'>
              {uiM('combobox_no_match')}
            </div>
          {:else}
            {#each filteredOptions as opt (opt.value)}
              <Combobox.Item
                value={opt.value}
                label={opt.label}
                disabled={opt.disabled}
                class={cn(itemClass, 'data-selected:bg-primary/10 data-selected:text-primary data-selected:font-medium')}
              >
                {#snippet children({ selected })}
                  <span class='size-4 shrink-0'>
                    {#if selected}
                      <span class='icon-[tabler--check] size-4 text-primary'></span>
                    {/if}
                  </span>
                  <div class='flex-1 min-w-0'>
                    <span>{opt.label}</span>
                    {#if opt.description}
                      <div class='truncate text-xs text-base-content/50'>{opt.description}</div>
                    {/if}
                  </div>
                {/snippet}
              </Combobox.Item>
            {/each}
          {/if}
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox.Root>
  {/if}

  {#if error}
    <span class='fieldset-label text-error'>{error}</span>
  {/if}
</div>
