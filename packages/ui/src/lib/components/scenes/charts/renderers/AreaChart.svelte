<!--
  =============================================================================
  @h-ai/ui - AreaChart 内部渲染器
  =============================================================================
  对 LayerChart AreaChart 的薄包装，仅做类型收窄和统一导入路径。
  不对外暴露；由 Chart.svelte 按 type='area' 内部路由调用。
  =============================================================================
-->
<script lang='ts'>
  import type { AreaChartProps } from 'layerchart'
  import type { ChartDataItem } from '../chart-types.js'
  import { AreaChart as LayerAreaChart } from 'layerchart'

  /** 透传给 LayerChart AreaChart 的全部原生属性。 */
  const { ...props }: AreaChartProps<ChartDataItem> = $props()
</script>

<LayerAreaChart {...props} />
