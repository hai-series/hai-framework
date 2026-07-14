<!--
  =============================================================================
  @h-ai/ui - ScatterChart 内部渲染器
  =============================================================================
  对 LayerChart ScatterChart 的薄包装，仅做类型收窄和统一导入路径。
  不对外暴露；由 Chart.svelte 按 type='scatter' 内部路由调用。
  =============================================================================
-->
<script lang='ts'>
  import type { ScatterChartProps } from 'layerchart'
  import type { ChartDataItem } from '../chart-types.js'
  import { ScatterChart as LayerScatterChart } from 'layerchart'

  /** 透传给 LayerChart ScatterChart 的全部原生属性。 */
  const { ...props }: ScatterChartProps<ChartDataItem> = $props()
</script>

<LayerScatterChart {...props} />
