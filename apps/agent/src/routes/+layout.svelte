<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { browser } from '$app/env'
  import { ToastContainer, ui } from '@h-ai/ui'
  import { getLocale } from '#lib/paraglide/runtime.js'
  import '../app.css'

  const { children }: { children: Snippet } = $props()

  $effect(() => {
    if (browser) {
      ui.applyTheme(ui.getSavedTheme(), false)
      ui.setGlobalLocale(getLocale())
    }
  })
</script>

{@render children()}
<ToastContainer />
