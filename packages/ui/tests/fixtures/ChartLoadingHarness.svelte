<script lang='ts'>
  import Chart from '../../src/lib/components/scenes/charts/Chart.svelte'

  let loading = $state(true)
  let empty = $state(false)
  let type = $state<'bar' | 'line'>('bar')
</script>
<button onclick={() => {
  loading = false
  empty = true
}}>Empty</button>
<button onclick={() => {
  loading = false
  empty = false
}}>Ready</button>
<button onclick={() => type = 'line'}>Line</button>
<Chart {type} {loading} data={empty ? [] : [{ month: 'Jan', revenue: 42 }]} x='month' y='revenue' preset='stacked-bar' seriesLayout='group' legend={false} customOption='native' height={180} />
