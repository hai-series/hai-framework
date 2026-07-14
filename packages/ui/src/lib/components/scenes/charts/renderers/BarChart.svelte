<!--
  =============================================================================
  @h-ai/ui - BarChart 内部渲染器
  =============================================================================
  对 LayerChart BarChart 的薄包装，仅做类型收窄和统一导入路径。
  不对外暴露；由 Chart.svelte 按 type='bar' 内部路由调用。
  =============================================================================
-->
<script lang='ts'>
  import type { BarChartProps } from 'layerchart'
  import type { ChartDataItem } from '../chart-types.js'
  import { BarChart as LayerBarChart } from 'layerchart'

  /** 透传给 LayerChart BarChart 的全部原生属性。 */
  const { ...props }: BarChartProps<ChartDataItem> = $props()
</script>

<LayerBarChart {...props} />
