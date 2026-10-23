<script lang='ts'>
  import { Pagination } from '../../src/lib/components/compounds/index.js'

  let page = $state(1)
</script>

<button type='button' onclick={() => page = 4}>External page</button>
<Pagination bind:page total={100} pageSize={10} showJumper showSizeChanger />
