<!--
  =============================================================================
  @h-ai/ui - Spinner 组件
  =============================================================================
  加载指示器组件

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { SpinnerProps } from '../../types.js'
  import { cn } from '../../utils.js'

  const {
    size = 'md',
    variant = 'primary',
    class: className = '',
  }: SpinnerProps = $props()

  const sizeMap = {
    'xs': 'loading-xs',
    'sm': 'loading-sm',
    'md': 'loading-md',
    'lg': 'loading-lg',
    'xl': 'loading-lg', // DaisyUI 没有 xl，使用 lg
    '2xl': 'loading-lg',
    '3xl': 'loading-lg',
    '4xl': 'loading-lg',
  }

  const variantMap = {
    default: 'text-neutral',
    primary: 'text-primary',
    secondary: 'text-secondary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    info: 'text-info',
    ghost: 'text-base-content',
    link: 'text-base-content',
    outline: 'text-base-content',
  }

  const spinnerClass = $derived(
    cn(
      'loading loading-spinner',
      sizeMap[size],
      variantMap[variant] ?? variantMap.default,
      className,
    ),
  )
</script>

<span class={spinnerClass}></span>
