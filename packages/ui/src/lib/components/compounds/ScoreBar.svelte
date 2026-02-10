<!--
  @component ScoreBar
  分数进度条组件，根据分数自动显示不同颜色。

  @prop {number} value - 当前分数值
  @prop {number} max - 最大分数值，默认 100
  @prop {string} size - 尺寸：sm|md|lg
  @prop {boolean} showLabel - 是否显示分数标签

  @description
  颜色规则：
  - >= 80: 绿色 (success)
  - >= 60: 蓝色 (info)
  - >= 40: 黄色 (warning)
  - < 40: 红色 (error)

  @example
  <ScoreBar value={85} size="lg" />
-->
<script lang='ts'>
  interface Props {
    value: number
    max?: number
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
    class?: string
  }

  let {
    value,
    max = 100,
    size = 'md',
    showLabel = true,
    class: className = '',
  }: Props = $props()

  const percentage = $derived(Math.min(Math.max((value / max) * 100, 0), 100))

  const colorClass = $derived.by(() => {
    if (value >= 80) return 'progress-success'
    if (value >= 60) return 'progress-info'
    if (value >= 40) return 'progress-warning'
    return 'progress-error'
  })

  const sizeClasses: Record<string, string> = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }
</script>

<div class='flex items-center gap-3 {className}'>
  <progress 
    class='progress {colorClass} {sizeClasses[size]} flex-1' 
    value={percentage}
    max={100}
  ></progress>
  {#if showLabel}
    <span class='text-sm font-medium tabular-nums min-w-[3ch] text-right'>
      {Math.round(percentage)}
    </span>
  {/if}
</div>
