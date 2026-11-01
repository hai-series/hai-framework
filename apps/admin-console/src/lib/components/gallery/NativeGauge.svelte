<!-- ReportCard 可承载原生 LayerChart 图形，SVG 入口仅由此动态示例加载。 -->
<script lang='ts'>
  import { ArcChart } from 'layerchart/svg'
  import 'layerchart/daisyui-5.css'

  const { label, value = 72 }: { label: string, value?: number } = $props()
</script>

<div role='img' aria-label={`${label}: ${value}%`} class='relative min-w-0' data-testid='native-gauge'>
  <ArcChart data={[{ key: label, value }]} value='value' maxValue={100} range={[-90, 90]} innerRadius={0.78} cornerRadius={8} height={240} cRange={['var(--color-primary)']} />
  <div class='pointer-events-none absolute inset-x-0 bottom-10 text-center'>
    <strong class='text-3xl tabular-nums'>{value}%</strong>
    <p class='mt-1 text-sm text-base-content/80'>{label}</p>
  </div>
</div>
