<!--
  =============================================================================
  @hai/ui - Avatar 组件
  =============================================================================
  头像组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { AvatarProps } from '../types.js'
  import { cn } from '../utils.js'
  
  let {
    src = '',
    alt = '',
    name = '',
    size = 'md',
    shape = 'circle',
    class: className = '',
  }: AvatarProps = $props()
  
  const sizeMap = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }
  
  const textSizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-3xl',
  }
  
  // 获取名称首字母
  const initials = $derived(() => {
    if (!name) return ''
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  })
  
  // 根据名称生成颜色
  const bgColor = $derived(() => {
    if (!name) return 'bg-neutral'
    const colors = ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-info', 'bg-success', 'bg-warning']
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  })
  
  const sizeValue = $derived(typeof size === 'number' ? `${size}px` : undefined)
  
  const containerClass = $derived(
    cn(
      'avatar',
      !src && 'placeholder',
    )
  )
  
  const innerClass = $derived(
    cn(
      typeof size === 'string' && sizeMap[size],
      shape === 'circle' ? 'rounded-full' : 'rounded-lg',
      !src && bgColor(),
      !src && 'text-neutral-content',
      className,
    )
  )
</script>

<div class={containerClass}>
  <div
    class={innerClass}
    style:width={sizeValue}
    style:height={sizeValue}
  >
    {#if src}
      <img {src} {alt} />
    {:else}
      <span class={typeof size === 'string' ? textSizeMap[size] : 'text-lg'}>
        {initials()}
      </span>
    {/if}
  </div>
</div>
