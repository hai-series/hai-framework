<!--
  @component MultiSelect
  多选自动补全组件，支持搜索过滤和多选，适用于用户选择等场景。

  @prop {string} label - 标签文本
  @prop {Option[]} options - 选项列表
  @prop {string[]} selected - 已选中的值数组
  @prop {string} placeholder - 占位文本
  @prop {boolean} disabled - 是否禁用
  @prop {string} error - 错误提示
  @prop {function} onchange - 选中项变化时的回调

  @example
  <MultiSelect
    label="选择用户"
    options={userOptions}
    selected={selectedUserIds}
    onchange={(ids) => selectedUserIds = ids}
    placeholder="搜索用户..."
  />
-->
<script lang='ts'>
  interface Option {
    label: string
    value: string
    description?: string
  }

  interface Props {
    label?: string
    options: Option[]
    selected?: string[]
    placeholder?: string
    disabled?: boolean
    error?: string
    class?: string
    onchange?: (selected: string[]) => void
  }

  let {
    label,
    options,
    selected = $bindable([]),
    placeholder = '搜索...',
    disabled = false,
    error,
    class: className = '',
    onchange,
  }: Props = $props()

  let search = $state('')
  let isOpen = $state(false)
  let containerRef = $state<HTMLDivElement | null>(null)
  let listboxId = `listbox-${Math.random().toString(36).slice(2)}`

  const filteredOptions = $derived(
    options.filter(opt =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.description?.toLowerCase().includes(search.toLowerCase())
    )
  )

  const selectedOptions = $derived(
    options.filter(opt => selected.includes(opt.value))
  )

  function toggleOption(value: string) {
    const newSelected = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value]
    selected = newSelected
    onchange?.(newSelected)
    search = ''
  }

  function removeOption(value: string, event: MouseEvent) {
    event.stopPropagation()
    const newSelected = selected.filter(v => v !== value)
    selected = newSelected
    onchange?.(newSelected)
  }

  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      isOpen = false
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  })
</script>

<div class='form-control w-full {className}'>
  {#if label}
    <label class='label'>
      <span class='label-text font-medium'>{label}</span>
    </label>
  {/if}

  <div class='relative' bind:this={containerRef}>
    <!-- 选中项展示 + 输入框 -->
    <div
      class='min-h-10 px-2 py-1.5 border rounded-lg bg-base-100 cursor-text flex flex-wrap gap-1.5 items-center transition-colors
        {disabled ? "opacity-50 cursor-not-allowed bg-base-200" : ""}
        {error ? "border-error focus-within:border-error focus-within:ring-error/20" : "border-base-content/20 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20"}'
    >
      {#each selectedOptions as opt (opt.value)}
        <span class='inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-sm rounded-md'>
          <span class='truncate max-w-32'>{opt.label}</span>
          {#if !disabled}
            <button
              type='button'
              class='hover:bg-primary/20 rounded p-0.5 transition-colors'
              onclick={(e) => removeOption(opt.value, e)}
              aria-label='移除 {opt.label}'
            >
              <span class='icon-[tabler--x] size-3'></span>
            </button>
          {/if}
        </span>
      {/each}

      <input
        type='text'
        class='flex-1 min-w-20 bg-transparent outline-none text-sm py-0.5'
        placeholder={selectedOptions.length === 0 ? placeholder : ''}
        bind:value={search}
        onfocus={() => !disabled && (isOpen = true)}
        {disabled}
        role='combobox'
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete='list'
      />
    </div>

    <!-- 下拉选项 -->
    {#if isOpen && !disabled}
      <div
        id={listboxId}
        role='listbox'
        class='absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-base-100 border border-base-content/10 rounded-lg shadow-lg'
      >
        {#if filteredOptions.length === 0}
          <div class='px-3 py-2 text-sm text-base-content/50'>无匹配项</div>
        {:else}
          {#each filteredOptions as opt (opt.value)}
            <button
              type='button'
              role='option'
              aria-selected={selected.includes(opt.value)}
              class='w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-base-200 transition-colors'
              onclick={() => toggleOption(opt.value)}
            >
              <span class='size-4 rounded border border-base-content/30 flex items-center justify-center {selected.includes(opt.value) ? "bg-primary border-primary" : ""}'>
                {#if selected.includes(opt.value)}
                  <span class='icon-[tabler--check] size-3 text-primary-content'></span>
                {/if}
              </span>
              <div class='flex-1 min-w-0'>
                <div class='truncate'>{opt.label}</div>
                {#if opt.description}
                  <div class='text-xs text-base-content/50 truncate'>{opt.description}</div>
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  {#if error}
    <label class='label'>
      <span class='label-text-alt text-error'>{error}</span>
    </label>
  {/if}
</div>
