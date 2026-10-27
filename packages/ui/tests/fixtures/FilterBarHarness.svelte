<script lang='ts'>
  import { FilterBar } from '../../src/lib/components/compounds/index.js'

  let query = $state('')
  let value = $state('Active')
</script>

<FilterBar activeCount={value ? 1 : 0} onreset={() => {
  value = ''
  query = ''
}}>
  {#snippet leading()}<input aria-label='Search' bind:value={query} />{/snippet}
  {#snippet actions()}<button type='button'>Query</button>{/snippet}
  <input aria-label='Advanced' bind:value />
</FilterBar>
