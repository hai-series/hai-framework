<script lang='ts'>
  import Drawer from '../../src/lib/components/compounds/Drawer.svelte'
  import Modal from '../../src/lib/components/compounds/Modal.svelte'
  import Popover from '../../src/lib/components/compounds/Popover.svelte'

  const { kind = 'modal' }: { kind?: 'modal' | 'drawer' } = $props()
  const Container = $derived(kind === 'modal'
    ? Modal
    : Drawer)
  let dialogOpen = $state(true)
</script>

<button data-testid='background'>Background</button>
<button data-testid='close-host' onpointerdown={() => dialogOpen = false}>Close dialog</button>
<Container bind:open={dialogOpen} title='Dialog'>
  <button data-testid='before'>Before</button>
  <Popover>
    {#snippet triggerContent()}<button data-testid='trigger'>Open</button>{/snippet}
    <button data-testid='inside'>Inside</button>
  </Popover>
  <button data-testid='after'>After</button>
</Container>
