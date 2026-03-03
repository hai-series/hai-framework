<!--
  hai Admin Console - 根布局
  使用 TailwindCSS + DaisyUI 实现现代化 UI
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import '../app.css'
  import { browser } from '$app/environment'
  import { setGlobalLocale } from '@h-ai/ui'
  import { getLocale } from '$lib/paraglide/runtime.js'
  import * as m from '$lib/paraglide/messages'
  
  interface Props {
    children: Snippet
  }
  
  let { children }: Props = $props()

  // 客户端加载时，同步 Paraglide locale 到全局 i18n（由 @h-ai/ui 转发到 core）
  // 这确保 UI 组件与框架模块使用一致的 locale
  if (browser) {
    const paraglideLocale = getLocale()
    setGlobalLocale(paraglideLocale)
  }
</script>

<svelte:head>
  <meta name="theme-color" content="#570df8" />
  <meta name="description" content={m.meta_description()} />
</svelte:head>

{@render children()}
