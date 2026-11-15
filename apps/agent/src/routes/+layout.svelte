<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { browser } from '$app/env'
  import { applyTheme, getSavedTheme, setGlobalLocale, ToastContainer } from '@h-ai/ui'
  import { getLocale } from '#lib/paraglide/runtime.js'
  import '../app.css'

  const { children }: { children: Snippet } = $props()

  $effect(() => {
    if (browser) {
      applyTheme(getSavedTheme(), false)
      setGlobalLocale(getLocale())
    }
  })
</script>

{@render children()}
<ToastContainer />
