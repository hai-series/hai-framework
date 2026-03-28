<!--
  =============================================================================
  @h-ai/ui - Range 组件
  =============================================================================
  范围滑块组件，支持不同尺寸和颜色变体

  使用 Svelte 5 Runes ($props, $derived)
  使用 DaisyUI range 类
  =============================================================================
-->
<script lang='ts'>
  import { cn } from '../../utils.js'
  import BareInput from './BareInput.svelte'

  interface Props {
    /** 当前值 */
    value?: number
    /** 最小值 */
    min?: number
    /** 最大值 */
    max?: number
    /** 步长 */
    step?: number
    /** 尺寸 */
    size?: 'xs' | 'sm' | 'md' | 'lg'
    /** 颜色变体 */
    variant?: 'default' | 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info'
    /** 是否显示步长刻度 */
    showSteps?: boolean
    /** 是否禁用 */
    disabled?: boolean
    /** 变化事件 */
    onchange?: (value: number) => void
    /** 输入事件 */
    oninput?: (value: number) => void
    /** 自定义类名 */
    class?: string
  }

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    size = 'md',
    variant = 'default',
    showSteps = false,
    disabled = false,
    onchange,
    oninput,
    class: className = '',
  }: Props = $props()

  const sizeClass = $derived({
    xs: 'range-xs',
    sm: 'range-sm',
    md: 'range-md',
    lg: 'range-lg',
  }[size] || 'range-md')

  const variantClass = $derived({
    default: '',
    primary: 'range-primary',
    secondary: 'range-secondary',
    accent: 'range-accent',
    success: 'range-success',
    warning: 'range-warning',
    error: 'range-error',
    info: 'range-info',
  }[variant] || '')

  const rangeClass = $derived(
    cn(
      'range',
      sizeClass,
      variantClass,
      className,
    ),
  )

  // 计算步长数量
  const stepCount = $derived(showSteps ? Math.floor((max - min) / step) + 1 : 0)

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement
    value = Number(target.value)
    oninput?.(value)
  }

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement
    value = Number(target.value)
    onchange?.(value)
  }
</script>

<div class='w-full'>
  <BareInput
    type='range'
    class={rangeClass}
    {min}
    {max}
    {step}
    value={`${value}`}
    {disabled}
    oninput={handleInput}
    onchange={handleChange}
  />

  {#if showSteps && stepCount > 0}
    <div class='flex w-full justify-between px-2 text-xs text-base-content/60'>
      {#each Array.from({ length: stepCount }) as _}
        <span>|</span>
      {/each}
    </div>
  {/if}
</div>
