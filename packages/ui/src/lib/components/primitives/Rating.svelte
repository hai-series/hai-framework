<!--
  =============================================================================
  @h-ai/ui - Rating 组件
  =============================================================================
  星级评分组件，支持全星/半星、只读模式、不同尺寸和颜色

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 DaisyUI rating 类
  =============================================================================
-->
<script lang='ts'>
  import { uiM } from '../../messages.js'
  import { cn } from '../../utils.js'

  interface Props {
    /** 当前评分值 (0 - max) */
    value?: number
    /** 最大星数 */
    max?: number
    /** 尺寸 */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    /** 颜色 */
    color?: 'default' | 'primary' | 'secondary' | 'accent' | 'warning' | 'success' | 'error' | 'info'
    /** 是否只读 */
    readonly?: boolean
    /** 是否支持半星 */
    half?: boolean
    /** 是否允许清除（点击已选星清除） */
    clearable?: boolean
    /** 是否禁用 */
    disabled?: boolean
    /** 评分名称（用于表单） */
    name?: string
    /** 变化事件 */
    onchange?: (value: number) => void
    /** 自定义类名 */
    class?: string
  }

  let {
    value = $bindable(0),
    max = 5,
    size = 'md',
    color = 'warning',
    readonly = false,
    half = false,
    clearable = false,
    disabled = false,
    name = `rating-${Math.random().toString(36).slice(2, 9)}`,
    onchange,
    class: className = '',
  }: Props = $props()

  const sizeClass = $derived({
    xs: 'rating-xs',
    sm: 'rating-sm',
    md: 'rating-md',
    lg: 'rating-lg',
    xl: 'rating-xl',
  }[size] || 'rating-md')

  const colorClass = $derived({
    default: 'bg-base-content',
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    accent: 'bg-accent',
    warning: 'bg-warning',
    success: 'bg-success',
    error: 'bg-error',
    info: 'bg-info',
  }[color] || 'bg-warning')

  const ratingClass = $derived(
    cn(
      'rating',
      sizeClass,
      half && 'rating-half',
      className,
    ),
  )

  function handleChange(newValue: number) {
    if (readonly || disabled)
      return
    value = newValue
    onchange?.(newValue)
  }

  // 生成评分项
  const items = $derived.by(() => {
    const result: { value: number, isHalf: boolean }[] = []

    if (clearable) {
      result.push({ value: 0, isHalf: false })
    }

    for (let i = 1; i <= max; i++) {
      if (half) {
        result.push({ value: i - 0.5, isHalf: true })
        result.push({ value: i, isHalf: false })
      }
      else {
        result.push({ value: i, isHalf: false })
      }
    }

    return result
  })
</script>

{#if readonly}
  <!-- 只读模式 - 使用 div 而非 input -->
  <div class={cn('rating', sizeClass, className)}>
    {#each Array.from({ length: max }) as _, i}
      <div
        class={cn(
          'mask mask-star-2',
          colorClass,
          i < Math.floor(value) && 'opacity-100',
          i >= Math.ceil(value) && 'opacity-30',
          i === Math.floor(value) && value % 1 !== 0 && 'opacity-60',
        )}
        aria-label={uiM('rating_star', { count: i + 1 })}
        aria-current={i + 1 <= value ? 'true' : undefined}
      ></div>
    {/each}
  </div>
{:else}
  <!-- 交互模式 - 使用 radio input -->
  <div class={ratingClass}>
    {#each items as item}
      <input
        type='radio'
        {name}
        class={cn(
          item.value === 0 ? 'rating-hidden' : 'mask mask-star-2',
          item.value !== 0 && colorClass,
          half && item.isHalf && 'mask-half-1',
          half && !item.isHalf && item.value !== 0 && 'mask-half-2',
        )}
        aria-label={item.value === 0 ? uiM('rating_clear') : uiM('rating_star', { count: item.value })}
        checked={value === item.value}
        {disabled}
        onchange={() => handleChange(item.value)}
      />
    {/each}
  </div>
{/if}
