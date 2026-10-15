<script lang='ts'>
  import { Input, Textarea } from '../../src/lib/components/primitives/index.js'

  const { multiline = false }: { multiline?: boolean } = $props()
  let value = $state('')
</script>

<form>
  {#if multiline}
    <Textarea bind:value required />
  {:else}
    <Input bind:value required />
  {/if}
  <button type='button' onclick={() => value = 'Restored'}>Restore</button>
</form>
