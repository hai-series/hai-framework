<script lang="ts">
  import { onMount } from 'svelte'
  import { initCapacitor } from '$lib/capacitor'
  import '../app.css'

  let { children } = $props()

  onMount(() => {
    initCapacitor()
  })
</script>

<div class="hai-safe-all min-h-screen">
  {@render children()}
</div>
