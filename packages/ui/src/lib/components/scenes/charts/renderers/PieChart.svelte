<!--
  =============================================================================
  @h-ai/ui - PieChart 内部渲染器
  =============================================================================
  对 LayerChart PieChart 的薄包装，仅做类型收窄和统一导入路径。
  不对外暴露；由 Chart.svelte 按 type='pie' 内部路由调用。
  =============================================================================
-->
<script lang='ts'>
  import type { PieChartProps } from 'layerchart'
  import type { ChartDataItem } from '../chart-types.js'
  import { PieChart as LayerPieChart } from 'layerchart'

  /** 透传给 LayerChart PieChart 的全部原生属性。 */
  const { ...props }: PieChartProps<ChartDataItem> = $props()
</script>

<LayerPieChart {...props} />
