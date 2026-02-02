<!--
  @component MultiSelect
  多选自动补全组件，支持搜索过滤和多选
  内置多语言支持，自动跟随全局 locale
-->
<script lang='ts'>
  import { m } from '../../messages.js'
  import BareInput from '../primitives/BareInput.svelte'
  import BareButton from '../primitives/BareButton.svelte'
  
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
    placeholder = 'Search...',
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
    return undefined
  })
</script>

<div class='form-control w-full {className}'>
  {#if label}
    <div class='label'>
      <span class='label-text font-medium'>{label}</span>
    </div>
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
            <BareButton
              type='button'
              class='hover:bg-primary/20 rounded p-0.5 transition-colors'
              onclick={(e) => removeOption(opt.value, e)}
              ariaLabel={`${m('multi_select_remove')} ${opt.label}`}
            >
              <span class='icon-[tabler--x] size-3'></span>
            </BareButton>
          {/if}
        </span>
      {/each}

      <BareInput
        type='text'
        class='flex-1 min-w-20 bg-transparent outline-none text-sm py-0.5'
        placeholder={selectedOptions.length === 0 ? placeholder : ''}
        bind:value={search}
        onfocus={() => !disabled && (isOpen = true)}
        {disabled}
        role='combobox'
        ariaExpanded={isOpen}
        ariaControls={listboxId}
        ariaAutocomplete='list'
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
          <div class='px-3 py-2 text-sm text-base-content/50'>{m('multi_select_no_match')}</div>
        {:else}
          {#each filteredOptions as opt (opt.value)}
            <BareButton
              type='button'
              role='option'
              ariaSelected={selected.includes(opt.value)}
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
            </BareButton>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  {#if error}
    <div class='label'>
      <span class='label-text-alt text-error'>{error}</span>
    </div>
  {/if}
</div>
