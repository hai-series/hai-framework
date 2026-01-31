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
  /** i18n labels configuration */
  interface SeverityLabels {
    critical?: string
    high?: string
    medium?: string
    low?: string
  }
  
  interface Props {
    type: 'critical' | 'high' | 'medium' | 'low'
    size?: 'xs' | 'sm' | 'md'
    labels?: SeverityLabels
    class?: string
  }

  import { m } from '../../messages.js'

  let { type, size = 'sm', labels = {}, class: className = '' }: Props = $props()

  /** Severity style mapping */
  const typeStyles: Record<string, string> = {
    critical: 'badge-error',
    high: 'badge-warning',
    medium: 'badge-info',
    low: 'badge-success',
  }

  /** Size style mapping */
  const sizeClasses: Record<string, string> = {
    xs: 'badge-xs',
    sm: 'badge-sm',
    md: '',
  }
</script>

<span class='badge {typeStyles[type]} {sizeClasses[size]} {className}'>
  {labels[type] ?? (
    type === 'critical' ? m('severity_critical') :
    type === 'high' ? m('severity_high') :
    type === 'medium' ? m('severity_medium') :
    m('severity_low')
  )}
</span>
