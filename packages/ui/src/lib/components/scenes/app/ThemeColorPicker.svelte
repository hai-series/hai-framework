<!--
  @component ThemeColorPicker
  主题色选择器，提供预置主题色与原生取色盘能力。

  @prop {string} value - 当前选中的颜色值（Hex）
  @prop {Array<{ value: string, label: string }>} presets - 预置主题色列表
  @prop {function} onchange - 颜色变更回调
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import { uiM } from '../../../messages.js'
  import { DEFAULT_THEME_COLOR, THEME_COLOR_PRESETS } from '../../../theme-config.js'
  import { cn, getDataAttributes } from '../../../utils.js'

  const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/
  const SHORT_HEX_COLOR_REGEX = /^#[0-9a-f]{3}$/

  interface ThemeColorPreset {
    value: string
    label: string
  }

  interface Props {
    value?: string
    presets?: ThemeColorPreset[]
    disabled?: boolean
    onchange?: (color: string) => void
    pickerLabel?: string
    customLabel?: string
    class?: string
  }

  const {
    value = DEFAULT_THEME_COLOR,
    presets,
    disabled = false,
    onchange,
    pickerLabel,
    customLabel,
    class: className = '',
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let colorInputRef = $state<HTMLInputElement | null>(null)

  const defaultPresets = $derived(
    THEME_COLOR_PRESETS.map(preset => ({
      value: preset.value,
      label: uiM(preset.labelKey),
    })),
  )

  const resolvedPresets = $derived(presets?.length ? presets : defaultPresets)
  const displayPickerLabel = $derived(pickerLabel ?? uiM('theme_color_picker_label'))
  const displayCustomLabel = $derived(customLabel ?? uiM('theme_color_custom'))

  function normalizeHexColor(input: string | undefined): string | null {
    const normalized = input?.trim().toLowerCase() ?? ''

    if (HEX_COLOR_REGEX.test(normalized)) {
      return normalized
    }

    if (SHORT_HEX_COLOR_REGEX.test(normalized)) {
      return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
    }

    return null
  }

  const normalizedPresets = $derived(
    resolvedPresets
      .map((preset) => {
        const normalizedValue = normalizeHexColor(preset.value)
        if (!normalizedValue) {
          return null
        }

        return {
          ...preset,
          value: normalizedValue,
        }
      })
      .filter((preset): preset is ThemeColorPreset => Boolean(preset)),
  )

  const currentColor = $derived(normalizeHexColor(value) ?? DEFAULT_THEME_COLOR)
  const activePreset = $derived(
    normalizedPresets.find(preset => preset.value === currentColor) ?? null,
  )

  function updateColor(nextColor: string): void {
    const normalized = normalizeHexColor(nextColor)
    if (!normalized || normalized === currentColor) {
      return
    }

    onchange?.(normalized)
  }
</script>

<div {...dataAttributes} class={cn('theme-color-picker', className)}>
  <div class='flex flex-wrap items-center gap-2'>
    {#each normalizedPresets as preset (preset.value)}
      <button
        type='button'
        class={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors',
          preset.value === currentColor
            ? 'border-primary bg-primary/10 text-primary shadow-sm'
            : 'border-base-content/12 bg-base-100 text-base-content hover:border-primary/25 hover:bg-base-200/80',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        aria-pressed={preset.value === currentColor}
        disabled={disabled}
        onclick={() => updateColor(preset.value)}
      >
        <span
          class='size-4 shrink-0 rounded-full border border-black/10'
          style={`background:${preset.value};`}
          aria-hidden='true'
        ></span>
        <span>{preset.label}</span>
      </button>
    {/each}

    <button
      type='button'
      class={cn(
        'group inline-flex items-center gap-2 rounded-full border px-3 py-2 text-left text-sm transition-colors',
        activePreset
          ? 'border-base-content/12 bg-base-100 text-base-content hover:border-primary/25 hover:bg-base-200/80'
          : 'border-primary bg-primary/10 text-primary shadow-sm',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      aria-label={displayPickerLabel}
      aria-pressed={!activePreset}
      disabled={disabled}
      onclick={() => colorInputRef?.click()}
    >
      <span
        class='size-4 shrink-0 rounded-full border border-black/10 shadow-sm transition-transform group-hover:scale-[1.03]'
        style={`background:${currentColor};`}
        aria-hidden='true'
      ></span>

      <span class='inline-flex items-center gap-2 min-w-0'>
        <span>{displayCustomLabel}</span>
        {#if !activePreset}
          <span class='text-xs uppercase tracking-[0.14em] text-current/70'>
            {currentColor}
          </span>
        {/if}
      </span>
    </button>

    <input
      bind:this={colorInputRef}
      class='sr-only'
      type='color'
      value={currentColor}
      aria-label={displayPickerLabel}
      disabled={disabled}
      onchange={event => updateColor(event.currentTarget.value)}
    />
  </div>
</div>

<style>
  .theme-color-picker button {
    border-color: var(--soft-border, color-mix(in oklab, var(--color-base-content) 12%, transparent));
    background: var(--soft-surface, var(--color-base-100));
    color: var(--soft-text-body, var(--color-base-content));
    box-shadow: none;
    font-weight: 500;
  }

  .theme-color-picker button:hover:not(:disabled) {
    border-color: color-mix(in oklab, var(--color-primary) 28%, var(--soft-border, transparent) 72%);
    background: color-mix(
      in oklab,
      var(--soft-surface, var(--color-base-100)) 88%,
      var(--color-base-200) 12%
    );
  }

  .theme-color-picker button[aria-pressed='true'] {
    border-color: color-mix(in oklab, var(--color-primary) 42%, var(--soft-border, transparent) 58%);
    background: color-mix(
      in oklab,
      var(--color-primary) 10%,
      var(--soft-surface, var(--color-base-100)) 90%
    );
    color: var(--color-primary);
  }

  .theme-color-picker button:focus,
  .theme-color-picker button:focus-visible {
    outline: none;
    border-color: color-mix(in oklab, var(--color-primary) 48%, var(--soft-border, transparent) 52%);
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-primary) 12%, transparent 88%);
  }

  .theme-color-picker button > span:first-child {
    border-color: color-mix(in oklab, var(--color-base-content) 10%, transparent 90%);
    box-shadow: none;
  }
</style>
