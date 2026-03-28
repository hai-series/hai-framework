<script lang='ts'>
  import { initCapacitor } from '$lib/capacitor'
  import { onMount } from 'svelte'
  import '../app.css'

  const { children } = $props()

  onMount(() => {
    initCapacitor()
  })
</script>

<div class='hai-safe-all min-h-screen'>
  {@render children()}
</div>
