<!--
  UI Gallery - Charts
  展示 @h-ai/ui Chart 统一入口及 LayerChart 原生配置透传。
-->
<script lang='ts'>
  import type { ChartDataItem, ChartSeries } from '@h-ai/ui'
  import DemoCard from '$lib/components/gallery/DemoCard.svelte'
  import DemoSection from '$lib/components/gallery/DemoSection.svelte'
  import * as m from '$lib/paraglide/messages'
  import { Button, Select } from '@h-ai/ui'
  import { Chart, DashboardGrid, MetricCard, ReportCard } from '@h-ai/ui/components/scenes/charts/index'
  import { notifyError } from '@h-ai/ui/toast'

  let period = $state('month')
  let selectedPreset = $state('grouped-bar')
  let reportState = $state('ready')
  let showNative = $state(false)
  const nativeGauge = $derived(showNative
    ? import('$lib/components/gallery/NativeGauge.svelte').catch((error: unknown) => {
      notifyError(m.common_error())
      throw error
    })
    : undefined)
  const dashboardData = $derived(period === 'quarter'
    ? [{ period: '07', revenue: 138400, cost: 74200 }, { period: '08', revenue: 152800, cost: 81600 }, { period: '09', revenue: 168200, cost: 88000 }]
    : [{ period: '01–07', revenue: 28400, cost: 16200 }, { period: '08–14', revenue: 32600, cost: 17800 }, { period: '15–21', revenue: 30100, cost: 16400 }, { period: '22–30', revenue: 37330, cost: 19100 }])
  const revenue = $derived(dashboardData.reduce((total, row) => total + row.revenue, 0))
  const reportSeries = $derived<ChartSeries[]>([
    { key: 'revenue', label: m.gallery_dashboard_revenue() },
    { key: 'cost', label: m.gallery_dashboard_cost() },
  ])
  const dashboardChannels = $derived<ChartDataItem[]>([
    { channel: m.gallery_dashboard_direct(), value: 46 },
    { channel: m.gallery_dashboard_search(), value: 34 },
    { channel: m.gallery_dashboard_partner(), value: 20 },
  ])
  const presets = $derived([
    { value: 'grouped-bar', label: m.gallery_dashboard_grouped() },
    { value: 'stacked-bar', label: m.gallery_dashboard_stacked() },
    { value: 'stacked-area', label: m.gallery_dashboard_area() },
    { value: 'donut', label: m.gallery_dashboard_donut() },
    { value: 'sparkline', label: m.gallery_dashboard_sparkline() },
  ])

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
  <div class='flex min-w-0 flex-wrap items-end justify-between gap-3'>
    <div>
      <h3 class='font-semibold'>{m.gallery_dashboard_title()}</h3>
      <p class='mt-1 text-sm text-base-content/80'>{m.gallery_dashboard_desc()}</p>
    </div>
    <div class='w-44'>
      <label for='dashboard-period-control' class='mb-1 block text-xs text-base-content/80'>{m.gallery_dashboard_period()}</label>
      <Select id='dashboard-period-control' data-testid='dashboard-period' bind:value={period} options={[
        { value: 'month', label: m.gallery_dashboard_period_month() },
        { value: 'quarter', label: m.gallery_dashboard_period_quarter() },
      ]} />
    </div>
  </div>

  <DashboardGrid label={m.gallery_dashboard_metrics()} columns={4} data-testid='dashboard-metrics'>
    <MetricCard title={m.gallery_dashboard_revenue()} value={revenue.toLocaleString()} unit='CNY' trend={12.8} trendTone='success' trendLabel={m.gallery_dashboard_comparison()} data-testid='revenue-metric'>
      <Chart preset='sparkline' data={dashboardData} x='period' y='revenue' height={32} />
    </MetricCard>
    <MetricCard title={m.gallery_dashboard_orders()} value={period === 'quarter' ? '4,268' : '1,482'} trend={8.4} trendTone='success' trendLabel={m.gallery_dashboard_comparison()} />
    <MetricCard title={m.gallery_dashboard_conversion()} value='6.82%' trend={2.1} trendTone='success' trendLabel={m.gallery_dashboard_comparison()} />
    <MetricCard title={m.gallery_dashboard_latency()} value={42} unit='ms' trend={-8.2} trendTone='success' trendLabel={m.gallery_dashboard_comparison()} />
  </DashboardGrid>

  <DashboardGrid label={m.gallery_dashboard_reports()} data-testid='dashboard-reports'>
    <ReportCard title={m.gallery_dashboard_trend()} description={m.gallery_dashboard_updated()}>
      <Chart preset='grouped-bar' data={dashboardData} x='period' y={['revenue', 'cost']} series={reportSeries} height={260} />
    </ReportCard>
    <ReportCard title={m.gallery_dashboard_channels()} description={m.gallery_dashboard_updated()}>
      <Chart preset='donut' data={dashboardChannels} x='channel' y='value' height={260} />
    </ReportCard>
    <ReportCard title={m.gallery_dashboard_presets()} data-testid='preset-report'>
      {#snippet actions()}
        <label class='sr-only' for='chart-preset-control'>{m.gallery_dashboard_presets()}</label>
        <Select id='chart-preset-control' data-testid='chart-preset' size='sm' bind:value={selectedPreset} options={presets} />
      {/snippet}
      {#if selectedPreset === 'donut'}
        <Chart preset='donut' data={dashboardChannels} x='channel' y='value' height={240} />
      {:else if selectedPreset === 'sparkline'}
        <div class='flex min-h-60 items-center'>
          <div class='w-full'><Chart preset='sparkline' data={dashboardData} x='period' y='revenue' /></div>
        </div>
      {:else}
        <Chart preset={selectedPreset === 'stacked-area' ? 'stacked-area' : selectedPreset === 'stacked-bar' ? 'stacked-bar' : 'grouped-bar'} data={dashboardData} x='period' y={['revenue', 'cost']} series={reportSeries} height={240} />
      {/if}
    </ReportCard>
    <ReportCard title={m.gallery_dashboard_native()} description={m.gallery_dashboard_native_desc()}>
      {#if showNative}
        {#await nativeGauge}
          <div class='flex h-60 items-center justify-center'><span role='status' class='loading loading-spinner' aria-label={m.gallery_dashboard_loading()}></span></div>
        {:then module}
          {#if module}<module.default label={m.gallery_dashboard_target()} />{/if}
        {:catch}
          <Button onclick={() => window.location.reload()}>{m.action_refresh()}</Button>
        {/await}
      {:else}
        <div class='flex h-60 items-center justify-center'>
          <Button data-testid='load-native-chart' onclick={() => showNative = true}>{m.gallery_dashboard_native_load()}</Button>
        </div>
      {/if}
    </ReportCard>
    <ReportCard title={m.gallery_dashboard_states()} loading={reportState === 'loading'} empty={reportState === 'empty'} data-testid='report-state-preview'>
      {#snippet actions()}
        <label class='sr-only' for='report-state-control'>{m.gallery_dashboard_states()}</label>
        <Select id='report-state-control' data-testid='report-state' size='sm' bind:value={reportState} options={[
          { value: 'ready', label: m.gallery_dashboard_ready() },
          { value: 'loading', label: m.gallery_dashboard_loading() },
          { value: 'empty', label: m.gallery_dashboard_empty() },
        ]} />
      {/snippet}
      <Chart type='line' data={dashboardData} x='period' y='revenue' height={240} grid />
    </ReportCard>
  </DashboardGrid>

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
