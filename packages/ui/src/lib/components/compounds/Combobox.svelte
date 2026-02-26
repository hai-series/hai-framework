<!--
  @component Combobox
  可搜索下拉选择组件，基于 Bits UI headless + DaisyUI 样式。
  支持单选和多选模式，带搜索过滤、键盘导航、无障碍支持。
  多选模式下以标签形式展示已选项。

  @prop {Option[]} options - 选项列表
  @prop {string | string[]} value - 选中值（双向绑定，单选为 string，多选为 string[]）
  @prop {boolean} multiple - 是否多选模式
  @prop {string} placeholder - 输入框占位符
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
<script lang="ts">
  import { Combobox } from 'bits-ui'
  import { m } from '../../messages.js'
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
    disabled = false,
    error,
    label: fieldLabel,
    class: className = '',
    onchange,
  }: Props = $props()

  // 为未提供 value 时设置合适的默认值（仅在初始化时执行一次）
  const isMultiple = multiple
  if (value === undefined) {
    value = isMultiple ? [] : ''
  }

  let searchValue = $state('')
  let open = $state(false)

  /** 根据搜索关键词过滤选项 */
  const filteredOptions = $derived(
    searchValue === ''
      ? options
      : options.filter(opt =>
          opt.label.toLowerCase().includes(searchValue.toLowerCase())
          || opt.description?.toLowerCase().includes(searchValue.toLowerCase()),
        ),
  )

  /** 单选模式：输入框显示值（打开时显示搜索词，关闭时显示选中项标签） */
  const singleInputValue = $derived.by(() => {
    if (open) return searchValue
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

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    searchValue = e.currentTarget.value
    if (!open) open = true
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) searchValue = ''
  }

  /** 多选模式下移除某个已选项 */
  function removeItem(val: string, event: MouseEvent) {
    event.stopPropagation()
    if (!Array.isArray(value)) return
    const newValue = (value as string[]).filter(v => v !== val)
    value = newValue
    onchange?.(newValue)
  }
</script>

<div class="form-control w-full {className}">
  {#if fieldLabel}
    <div class="label">
      <span class="label-text font-medium">{fieldLabel}</span>
    </div>
  {/if}

  {#if multiple}
    <!-- 多选模式 -->
    <Combobox.Root
      type="multiple"
      items={filteredOptions}
      inputValue={multiInputValue}
      value={multiVal}
      bind:open
      {disabled}
      onOpenChange={handleOpenChange}
      onValueChange={(v) => { value = v; onchange?.(v) }}
    >
      <div class="relative">
        <div
          class="min-h-10 px-2 py-1.5 pr-8 border rounded-lg bg-base-100 flex flex-wrap gap-1.5 items-center transition-colors
            {disabled ? 'opacity-50 cursor-not-allowed bg-base-200' : 'cursor-text'}
            {error ? 'border-error focus-within:border-error' : 'border-base-content/20 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20'}"
        >
          {#each selectedOptions as opt (opt.value)}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-sm rounded-md">
              <span class="truncate max-w-32">{opt.label}</span>
              {#if !disabled}
                <BareButton
                  type="button"
                  class="hover:bg-primary/20 rounded p-0.5 transition-colors"
                  onclick={(e) => removeItem(opt.value, e)}
                  ariaLabel="{m('combobox_remove')} {opt.label}"
                >
                  <span class="icon-[tabler--x] size-3"></span>
                </BareButton>
              {/if}
            </span>
          {/each}

          <Combobox.Input
            class="flex-1 min-w-20 bg-transparent outline-none text-sm py-0.5"
            placeholder={selectedOptions.length === 0 ? placeholder : ''}
            {disabled}
            oninput={handleInput}
            onfocus={() => { if (!disabled) open = true }}
          />
        </div>

        <Combobox.Trigger
          class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
        >
          <span class="icon-[tabler--chevron-down] size-4 transition-transform {open ? 'rotate-180' : ''}"></span>
        </Combobox.Trigger>
      </div>

      <Combobox.Portal>
        <Combobox.Content
          class="z-50 mt-1 max-h-60 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-lg border border-base-content/10 bg-base-100 p-1 shadow-lg"
          sideOffset={4}
        >
          {#if filteredOptions.length === 0}
            <div class="px-3 py-2 text-sm text-base-content/50">
              {m('combobox_no_match')}
            </div>
          {:else}
            {#each filteredOptions as opt (opt.value)}
              <Combobox.Item
                value={opt.value}
                label={opt.label}
                disabled={opt.disabled}
                class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-base-200 data-[highlighted]:bg-base-200 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
              >
                {#snippet children({ selected })}
                  <span class="size-4 shrink-0 rounded border border-base-content/30 flex items-center justify-center {selected ? 'bg-primary border-primary' : ''}">
                    {#if selected}
                      <span class="icon-[tabler--check] size-3 text-primary-content"></span>
                    {/if}
                  </span>
                  <div class="flex-1 min-w-0">
                    <span>{opt.label}</span>
                    {#if opt.description}
                      <div class="text-xs text-base-content/50 truncate">{opt.description}</div>
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
      type="single"
      items={filteredOptions}
      inputValue={singleInputValue}
      value={singleVal}
      bind:open
      {disabled}
      onOpenChange={handleOpenChange}
      onValueChange={(v) => { value = v; onchange?.(v) }}
    >
      <div class="relative">
        <Combobox.Input
          class="input input-bordered w-full pr-8 {error ? 'input-error' : ''}"
          {placeholder}
          {disabled}
          oninput={handleInput}
          onfocus={() => { if (!disabled) open = true }}
        />
        <Combobox.Trigger
          class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
        >
          <span class="icon-[tabler--chevron-down] size-4 transition-transform {open ? 'rotate-180' : ''}"></span>
        </Combobox.Trigger>
      </div>

      <Combobox.Portal>
        <Combobox.Content
          class="z-50 mt-1 max-h-60 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-lg border border-base-content/10 bg-base-100 p-1 shadow-lg"
          sideOffset={4}
        >
          {#if filteredOptions.length === 0}
            <div class="px-3 py-2 text-sm text-base-content/50">
              {m('combobox_no_match')}
            </div>
          {:else}
            {#each filteredOptions as opt (opt.value)}
              <Combobox.Item
                value={opt.value}
                label={opt.label}
                disabled={opt.disabled}
                class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-base-200 data-[highlighted]:bg-base-200 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
              >
                {#snippet children({ selected })}
                  <span class="size-4 shrink-0">
                    {#if selected}
                      <span class="icon-[tabler--check] size-4 text-primary"></span>
                    {/if}
                  </span>
                  <div class="flex-1 min-w-0">
                    <span>{opt.label}</span>
                    {#if opt.description}
                      <div class="text-xs text-base-content/50 truncate">{opt.description}</div>
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
    <div class="label">
      <span class="label-text-alt text-error">{error}</span>
    </div>
  {/if}
</div>
