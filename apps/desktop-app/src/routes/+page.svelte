<script lang='ts'>
  import { onMount } from 'svelte'

  let greeting = $state('')

  onMount(async () => {
    // Tauri API 通过动态 import 延迟加载，避免在纯 Web 环境报错
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      greeting = await invoke('greet', { name: 'hai' })
    }
    catch {
      greeting = 'Hello, hai! (Web mode)'
    }
  })
</script>

<div class='flex min-h-screen items-center justify-center p-4'>
  <div class='text-center'>
    <h1 class='text-3xl font-bold'>hai Desktop App</h1>
    <p class='mt-2 text-base-content/60'>Tauri v2 + SvelteKit SPA</p>
    {#if greeting}
      <p class='mt-4 rounded-lg bg-base-200 px-4 py-2 text-sm'>{greeting}</p>
    {/if}
  </div>
</div>
