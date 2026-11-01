# 图表与轻量看板

业务负责查询、权限和聚合，UI 负责数值展示和交互。先选择 MetricCard / ReportCard / DashboardGrid，再选择统一 Chart 或原生 LayerChart。完整自助 BI、透视引擎与报表设计器不属于这些组件的职责。

```svelte
<script lang="ts">
  import { Chart, DashboardGrid, MetricCard, ReportCard } from '@h-ai/ui/components/scenes/charts/index'
  const data = [{ month: 'Jan', revenue: 42, cost: 24 }, { month: 'Feb', revenue: 58, cost: 31 }]
</script>

<DashboardGrid label="核心指标" columns={4}>
  <MetricCard title="收入" value="128,430" unit="CNY" trend={12.8} trendTone="success" trendLabel="较上月" />
  <MetricCard title="响应耗时" value={42} unit="ms" trend={-8.2} trendTone="success" />
</DashboardGrid>
<ReportCard title="收入与成本">
  <Chart preset="grouped-bar" {data} x="month" y={['revenue', 'cost']} />
</ReportCard>
```

示例文案由应用翻译模块提供。`value` 接受已格式化字符串或数值；缺失和非有限数显示“—”，零值正常显示。`trend={12.8}` 表示 +12.8%，`trendTone` 独立指定业务语义，不能把所有下降都标成坏结果。MetricCard children 可加入迷你趋势，不提供时不加载图形引擎。

DashboardGrid 在容器小于 40rem 时一列，40rem 起最多两列，64rem 起使用 columns 指定的 1–4 列。ReportCard 复用 Card，支持 actions、children、footer，以及 loading/empty 状态；状态期间不挂载图形。对长标题、长数值和窄容器检查溢出。

| preset | 图形 | 默认配置 |
| --- | --- | --- |
| grouped-bar | bar | seriesLayout='group'、坐标轴、网格、图例 |
| stacked-bar | bar | seriesLayout='stack'、坐标轴、网格、图例 |
| stacked-area | area | seriesLayout='stack'、坐标轴、网格、图例 |
| donut | pie | innerRadius=0.65、图例 |
| sparkline | line | 高度 64、无坐标轴/网格/图例/数据点 |

显式 type 优先于 preset 图形类型，未提供两者时为 line。显式原生参数覆盖预设：例如 `legend={false}`、`innerRadius={0.8}`、`height={80}`。原有 type/data/x/y 调用与 LayerChart 参数、snippet 透传保持兼容。

Chart 在 SSR 中保留高度并显示加载占位，浏览器挂载且数据非空后动态加载所选 renderer；loading/empty 时不加载。快速切换类型时过期导入不替换新图形。高级图形同样建议使用宿主动态组件；仅把组件放在条件分支里不等于拆分静态 import。

## 更多 LayerChart 图形

不需要把所有 LayerChart 能力压进 ChartType。ReportCard children 可承载 ArcChart、径向图、树图、热图等原生组件。应用显式添加与当前 UI 兼容的 layerchart 依赖（本仓库当前验证 2.6.1），按安装版本 exports 选择真实入口；layerchart/svg 等单渲染层入口可减少不需要的渲染分支。

```svelte
<script lang="ts">
  import { ReportCard } from '@h-ai/ui/components/scenes/charts/index'
  import { ArcChart } from 'layerchart/svg'
  import 'layerchart/daisyui-5.css'
</script>
<ReportCard title="目标完成率">
  <ArcChart data={[{ key: 'Target', value: 72 }]} value="value" maxValue={100} range={[-90, 90]} innerRadius={0.78} height={240} />
</ReportCard>
```

原生组件的类型、数据与生命周期遵循 LayerChart，UI 不转发或仿造整套上游 API。上例为静态使用片段；按需加载时将原生图形放进独立组件，由宿主使用动态 import。完整示例在 admin 图表展厅中，点击后才加载 ArcChart。
