<!--
  hai Admin Console - 根布局
  使用 TailwindCSS + DaisyUI 实现现代化 UI
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import '../app.css'
  import { browser } from '$app/environment'
  import { core } from '@h-ai/core'
  import { getLocale } from '$lib/paraglide/runtime.js'
  
  interface Props {
    children: Snippet
  }
  
  let { children }: Props = $props()

  // 客户端加载时，同步 Paraglide locale 到 @h-ai/core
  // 这确保 @h-ai/ui 等模块使用正确的 locale
  if (browser) {
    const paraglideLocale = getLocale()
    core.i18n.setGlobalLocale(paraglideLocale)
  }
</script>

<svelte:head>
  <meta name="theme-color" content="#570df8" />
  <meta name="description" content="hai Admin Console - 现代化管理后台" />
</svelte:head>

{@render children()}
