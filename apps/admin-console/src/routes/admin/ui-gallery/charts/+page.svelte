<!--
  UI Gallery - Charts
  展示 @h-ai/ui Chart 统一入口及 LayerChart 原生配置透传。
-->
<script lang='ts'>
  import type { ChartDataItem, ChartSeries } from '@h-ai/ui'
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import * as m from '$lib/paraglide/messages'
  import { Chart } from '@h-ai/ui'

  /** 月度经营数据，横向柱状图使用 revenue 作为数值轴。 */
  const monthlyRevenueData: ChartDataItem[] = [
    { month: 'Jan', revenue: 42, cost: 24 },
    { month: 'Feb', revenue: 58, cost: 31 },
    { month: 'Mar', revenue: 63, cost: 36 },
    { month: 'Apr', revenue: 78, cost: 42 },
    { month: 'May', revenue: 91, cost: 51 },
    { month: 'Jun', revenue: 105, cost: 57 },
  ]

  /** 增长趋势数据，折线和面积图共用以展示多 y 字段 series。 */
  const growthTrendData: ChartDataItem[] = [
    { month: 'Jan', visitors: 1200, signups: 180, cloud: 32, edge: 18 },
    { month: 'Feb', visitors: 1480, signups: 220, cloud: 38, edge: 23 },
    { month: 'Mar', visitors: 1720, signups: 260, cloud: 45, edge: 28 },
    { month: 'Apr', visitors: 2100, signups: 340, cloud: 54, edge: 36 },
    { month: 'May', visitors: 2380, signups: 390, cloud: 63, edge: 42 },
    { month: 'Jun', visitors: 2860, signups: 470, cloud: 74, edge: 51 },
  ]

  /** 渠道占比数据，Chart 会把 x/y 映射到 LayerChart PieChart 的 key/value。 */
  const channelShareData: ChartDataItem[] = [
    { channel: 'Direct', value: 38 },
    { channel: 'Search', value: 26 },
    { channel: 'Partner', value: 18 },
    { channel: 'Ads', value: 12 },
    { channel: 'Other', value: 6 },
  ]

  /** 服务质量散点数据，c 字段用于演示原生颜色 accessor 透传。 */
  const serviceQualityData: ChartDataItem[] = [
    { service: 'API', latency: 42, throughput: 830 },
    { service: 'Auth', latency: 55, throughput: 760 },
    { service: 'Storage', latency: 68, throughput: 620 },
    { service: 'AI', latency: 84, throughput: 510 },
    { service: 'Audit', latency: 37, throughput: 690 },
    { service: 'Cache', latency: 24, throughput: 920 },
  ]

  const lineSeries = $derived.by<ChartSeries[]>(() => [
    { key: 'visitors', label: m.gallery_chart_series_visitors() },
    { key: 'signups', label: m.gallery_chart_series_signups() },
  ])

  const areaSeries = $derived.by<ChartSeries[]>(() => [
    { key: 'cloud', label: m.gallery_chart_series_cloud() },
    { key: 'edge', label: m.gallery_chart_series_edge() },
  ])

  const barCode = `<Chart
  type='bar'
  data={monthlyRevenueData}
  x='revenue'
  y='month'
  orientation='horizontal'
/>`

  const lineCode = `<Chart
  type='line'
  data={growthTrendData}
  x='month'
  y={['visitors', 'signups']}
  series={lineSeries}
  lineVariant='segmented-point'
  tooltipMode='nearest'
  showCrosshair
  legend
/>`

  const areaCode = `<Chart
  type='area'
  data={growthTrendData}
  x='month'
  y={['cloud', 'edge']}
  series={areaSeries}
  seriesLayout='stack'
/>`

  const pieCode = `<Chart
  type='pie'
  data={channelShareData}
  x='channel'
  y='value'
  legend
  labels
/>`

  const scatterCode = `<Chart
  type='scatter'
  data={serviceQualityData}
  x='latency'
  y='throughput'
  c='service'
/>`
</script>

<svelte:head>
  <title>{m.gallery_tab_charts()} - {m.gallery_title()} - {m.app_title()}</title>
</svelte:head>

<DemoSection
  title={m.gallery_charts_title()}
  subtitle={m.gallery_charts_subtitle()}
  iconClass='icon-[tabler--chart-dots-3]'
  tone='info'
>
  <div class='grid gap-4 xl:grid-cols-2'>
    <DemoCard title={m.gallery_chart_bar_title()} description={m.gallery_chart_bar_desc()} code={barCode}>
      <Chart
        type='bar'
        data={monthlyRevenueData}
        x='revenue'
        y='month'
        orientation='horizontal'
        size='md'
        title={m.gallery_chart_bar_title()}
        description={m.gallery_chart_bar_desc()}
        axis
        grid
      />
    </DemoCard>

    <DemoCard title={m.gallery_chart_line_title()} description={m.gallery_chart_line_desc()} code={lineCode}>
      <Chart
        type='line'
        data={growthTrendData}
        x='month'
        y={['visitors', 'signups']}
        series={lineSeries}
        size='md'
        title={m.gallery_chart_line_title()}
        description={m.gallery_chart_line_desc()}
        legend
        grid
        lineVariant='segmented-point'
        tooltipMode='nearest'
        showCrosshair
      />
    </DemoCard>

    <DemoCard title={m.gallery_chart_area_title()} description={m.gallery_chart_area_desc()} code={areaCode}>
      <Chart
        type='area'
        data={growthTrendData}
        x='month'
        y={['cloud', 'edge']}
        series={areaSeries}
        seriesLayout='stack'
        size='md'
        title={m.gallery_chart_area_title()}
        description={m.gallery_chart_area_desc()}
        legend
      />
    </DemoCard>

    <DemoCard title={m.gallery_chart_pie_title()} description={m.gallery_chart_pie_desc()} code={pieCode}>
      <Chart
        type='pie'
        data={channelShareData}
        x='channel'
        y='value'
        size='md'
        title={m.gallery_chart_pie_title()}
        description={m.gallery_chart_pie_desc()}
        legend
        labels
      />
    </DemoCard>

    <DemoCard title={m.gallery_chart_scatter_title()} description={m.gallery_chart_scatter_desc()} code={scatterCode}>
      <Chart
        type='scatter'
        data={serviceQualityData}
        x='latency'
        y='throughput'
        c='service'
        size='md'
        title={m.gallery_chart_scatter_title()}
        description={m.gallery_chart_scatter_desc()}
        grid={{ x: true, y: true }}
        rule={{ x: 0, y: 0 }}
      />
    </DemoCard>

    <DemoCard title={m.gallery_chart_states_title()} description={m.gallery_chart_states_desc()}>
      <div class='grid gap-4 md:grid-cols-2'>
        <Chart
          type='line'
          data={growthTrendData}
          x='month'
          y='visitors'
          size='sm'
          title={m.gallery_chart_loading_title()}
          loading
        />
        <Chart
          type='bar'
          data={[]}
          x='month'
          y='revenue'
          size='sm'
          title={m.gallery_chart_empty_title()}
          empty
        />
      </div>
    </DemoCard>
  </div>
</DemoSection>
