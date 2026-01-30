<!--
  @component SeverityBadge
  严重程度标签组件，用于显示不同级别的状态。

  @prop {string} type - 严重程度：critical|high|medium|low
  @prop {string} size - 尺寸：xs|sm|md

  @description
  颜色映射：
  - critical: 红色 (error)
  - high: 橙色 (warning)
  - medium: 蓝色 (info)
  - low: 绿色 (success)

  @example
  <SeverityBadge type="critical" size="sm" />
-->
<script lang='ts'>
  interface Props {
    type: 'critical' | 'high' | 'medium' | 'low'
    size?: 'xs' | 'sm' | 'md'
    class?: string
  }

  let { type, size = 'sm', class: className = '' }: Props = $props()

  /** 严重程度样式映射 */
  const typeStyles: Record<string, { class: string, label: string }> = {
    critical: { class: 'badge-error', label: '严重' },
    high: { class: 'badge-warning', label: '高' },
    medium: { class: 'badge-info', label: '中' },
    low: { class: 'badge-success', label: '低' },
  }

  /** 尺寸样式映射 */
  const sizeClasses: Record<string, string> = {
    xs: 'badge-xs',
    sm: 'badge-sm',
    md: '',
  }
</script>

<span class='badge {typeStyles[type].class} {sizeClasses[size]} {className}'>
  {typeStyles[type].label}
</span>
