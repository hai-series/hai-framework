<!--
  @component Avatar
  头像组件，支持图片、名字首字母 fallback
-->
<script lang='ts'>
  import type { AvatarProps } from '../../types.js'
  import { cn } from '../../utils.js'

  const {
    src = '',
    alt = '',
    name = '',
    size = 'md',
    shape = 'circle',
    class: className = '',
  }: AvatarProps = $props()

  const sizeMap = {
    'xs': 'w-6 h-6',
    'sm': 'w-8 h-8',
    'md': 'w-10 h-10',
    'lg': 'w-14 h-14',
    'xl': 'w-20 h-20',
    '2xl': 'w-24 h-24',
    '3xl': 'w-28 h-28',
    '4xl': 'w-32 h-32',
  }

  const textSizeMap = {
    'xs': 'text-2xs',
    'sm': 'text-xs',
    'md': 'text-sm',
    'lg': 'text-lg',
    'xl': 'text-2xl',
    '2xl': 'text-3xl',
    '3xl': 'text-4xl',
    '4xl': 'text-5xl',
  }

  /* 获取名称首字母 */
  const initials = $derived(() => {
    if (!name)
      return ''
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  })

  /* 根据名称 hash 生成渐变色 */
  const gradientPairs = [
    ['from-blue-400 to-indigo-500', 'text-white'],
    ['from-emerald-400 to-teal-500', 'text-white'],
    ['from-amber-400 to-orange-500', 'text-white'],
    ['from-rose-400 to-pink-500', 'text-white'],
    ['from-violet-400 to-purple-500', 'text-white'],
    ['from-cyan-400 to-sky-500', 'text-white'],
  ] as const

  const colorPair = $derived(() => {
    if (!name)
      return gradientPairs[0]
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return gradientPairs[hash % gradientPairs.length]
  })

  const sizeValue = $derived(typeof size === 'number' ? `${size}px` : undefined)

  const containerClass = $derived(
    cn(
      'avatar',
      !src && 'placeholder',
    ),
  )

  const innerClass = $derived(
    cn(
      'flex items-center justify-center font-semibold',
      typeof size === 'string' && sizeMap[size],
      shape === 'circle' ? 'rounded-full' : 'rounded-lg',
      !src && `bg-gradient-to-br ${colorPair()[0]} ${colorPair()[1]}`,
      className,
    ),
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
