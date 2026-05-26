<!--
  hai Admin Console - 根布局
  使用 TailwindCSS + DaisyUI 实现现代化 UI
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { browser } from '$app/environment'
  import { adminConsoleKitConfig } from '$lib/config/kit-config'
  import * as m from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime.js'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { setGlobalLocale } from '@h-ai/ui'
  import '../app.css'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  // 浏览器端一次性初始化：
  // 1. 同步 Paraglide locale 到全局 i18n（@h-ai/ui 转发到 core）
  // 2. 按 _kit.yml 启用同源 /api 与 SvelteKit __data.json 的传输加密
  if (browser) {
    setGlobalLocale(getLocale())
    kit.client.installBrowserTransport(adminConsoleKitConfig, { crypto })
  }
</script>

<svelte:head>
  <meta name='theme-color' content='#570df8' />
  <meta name='description' content={m.meta_description()} />
</svelte:head>

{@render children()}
