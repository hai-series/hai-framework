<script lang='ts'>
  import { Drawer, Modal } from '../../src/lib/components/compounds/index.js'
  import { Button, Input } from '../../src/lib/components/primitives/index.js'

  const { drawer = false }: { drawer?: boolean } = $props()
  const Container = $derived(drawer ? Drawer : Modal)
  let open = $state(true)
</script>

<Button onclick={() => open = true} data-testid='reopen'>Open</Button>
<Container bind:open title='Editor'>
  <form>
    <Input required />
    <Button onclick={() => open = false} data-testid='close'>Close</Button>
  </form>
</Container>
