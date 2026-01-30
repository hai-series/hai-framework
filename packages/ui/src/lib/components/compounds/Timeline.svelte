<!--
  =============================================================================
  @hai/ui - Timeline 组件
  =============================================================================
  时间线组件，支持垂直/水平方向、多种样式变体
  
  使用 Svelte 5 Runes ($props, $derived)
  使用 DaisyUI timeline 类
  =============================================================================
-->
<script lang="ts" module>
  export interface TimelineItem {
    /** 唯一标识 */
    id: string
    /** 标题 */
    title: string
    /** 描述内容 */
    description?: string
    /** 时间/日期标签 */
    time?: string
    /** 图标（可选，支持 emoji 或字符） */
    icon?: string
    /** 状态颜色 */
    color?: 'default' | 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info'
    /** 是否已完成 */
    completed?: boolean
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '../../utils.js'
  
  interface Props {
    /** 时间线项数据 */
    items: TimelineItem[]
    /** 方向 */
    direction?: 'vertical' | 'horizontal'
    /** 是否响应式（小屏垂直，大屏水平） */
    responsive?: boolean
    /** 内容位置 */
    position?: 'start' | 'end' | 'alternate'
    /** 是否紧凑模式 */
    compact?: boolean
    /** 是否使用盒子样式 */
    boxed?: boolean
    /** 图标对齐方式 */
    snapIcon?: boolean
    /** 自定义类名 */
    class?: string
    /** 自定义项渲染 */
    children?: Snippet<[TimelineItem, number]>
  }
  
  let {
    items,
    direction = 'vertical',
    responsive = false,
    position = 'end',
    compact = false,
    boxed = false,
    snapIcon = false,
    class: className = '',
    children,
  }: Props = $props()
  
  const timelineClass = $derived(
    cn(
      'timeline',
      direction === 'vertical' && 'timeline-vertical',
      direction === 'horizontal' && 'timeline-horizontal',
      responsive && 'timeline-vertical lg:timeline-horizontal',
      compact && 'timeline-compact',
      snapIcon && 'timeline-snap-icon',
      className,
    )
  )
  
  function getColorClass(color?: string): string {
    const colorMap: Record<string, string> = {
      primary: 'bg-primary text-primary-content',
      secondary: 'bg-secondary text-secondary-content',
      accent: 'bg-accent text-accent-content',
      success: 'bg-success text-success-content',
      warning: 'bg-warning text-warning-content',
      error: 'bg-error text-error-content',
      info: 'bg-info text-info-content',
    }
    return colorMap[color || 'default'] || 'bg-base-content'
  }
  
  function getLineColorClass(item: TimelineItem, isAfter: boolean): string {
    if (!item.completed && isAfter) return ''
    return item.color ? `bg-${item.color}` : 'bg-primary'
  }
  
  function shouldShowStart(index: number): boolean {
    if (position === 'start') return true
    if (position === 'alternate') return index % 2 === 0
    return false
  }
  
  function shouldShowEnd(index: number): boolean {
    if (position === 'end') return true
    if (position === 'alternate') return index % 2 === 1
    return false
  }
</script>

<ul class={timelineClass}>
  {#each items as item, index (item.id)}
    <li>
      <!-- 前置连线 -->
      {#if index > 0}
        <hr class={cn(items[index - 1].completed && getLineColorClass(items[index - 1], true))} />
      {/if}
      
      <!-- 开始位置内容 -->
      {#if position !== 'end' && shouldShowStart(index)}
        <div class={cn('timeline-start', boxed && 'timeline-box')}>
          {#if children}
            {@render children(item, index)}
          {:else}
            {#if item.time}
              <time class="text-xs text-base-content/60">{item.time}</time>
            {/if}
            <div class="font-semibold">{item.title}</div>
            {#if item.description}
              <p class="text-sm text-base-content/70">{item.description}</p>
            {/if}
          {/if}
        </div>
      {:else if item.time && position === 'end'}
        <div class="timeline-start text-xs text-base-content/60">
          {item.time}
        </div>
      {/if}
      
      <!-- 中间图标 -->
      <div class="timeline-middle">
        {#if item.icon}
          <span class={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-sm',
            getColorClass(item.color),
          )}>
            {item.icon}
          </span>
        {:else}
          <span class={cn(
            'flex h-4 w-4 rounded-full',
            item.completed ? getColorClass(item.color) : 'bg-base-300',
          )}></span>
        {/if}
      </div>
      
      <!-- 结束位置内容 -->
      {#if position !== 'start' && shouldShowEnd(index)}
        <div class={cn('timeline-end', boxed && 'timeline-box')}>
          {#if children}
            {@render children(item, index)}
          {:else}
            {#if item.time && position === 'alternate'}
              <time class="text-xs text-base-content/60">{item.time}</time>
            {/if}
            <div class="font-semibold">{item.title}</div>
            {#if item.description}
              <p class="text-sm text-base-content/70">{item.description}</p>
            {/if}
          {/if}
        </div>
      {/if}
      
      <!-- 后置连线 -->
      {#if index < items.length - 1}
        <hr class={cn(item.completed && getLineColorClass(item, true))} />
      {/if}
    </li>
  {/each}
</ul>
