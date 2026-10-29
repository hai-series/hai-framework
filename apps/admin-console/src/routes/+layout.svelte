<!--
  hai Admin Console - 根布局
  使用 TailwindCSS + DaisyUI 实现现代化 UI
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { LayoutData } from './$types'
  import { browser } from '$app/environment'
  import { base } from '$app/paths'
  import * as m from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime.js'
  import { crypto } from '@h-ai/crypto'
  import { kit } from '@h-ai/kit'
  import { setGlobalLocale } from '@h-ai/ui'
  import { untrack } from 'svelte'
  import '../app.css'

  interface Props {
    children: Snippet
    data: LayoutData
  }

  interface BrowserTransportDebugState {
    __haiAdminTransportInstalled?: boolean
  }

  const { children, data }: Props = $props()

  // 浏览器端一次性初始化：
  // 1. 同步 Paraglide locale 到全局 i18n（@h-ai/ui 转发到 core）
  // 2. 按 _kit.yml 启用同源 /api 与 SvelteKit __data.json 的传输加密
  if (browser) {
    setGlobalLocale(getLocale())
    // 服务进程的配置在首次加载时固定，后续页面导航无需重新安装全局 fetch。
    const config = untrack(() => data.kitConfig)
    kit.client.installBrowserTransport(config, { crypto, basePath: base })

    // E2E 需要一个稳定、同步可观测的标记来判断浏览器端 transport 已安装完成。
    ;(window as Window & BrowserTransportDebugState).__haiAdminTransportInstalled = config.transport !== false
  }
</script>

<svelte:head>
  <meta name='theme-color' content='#570df8' />
  <meta name='description' content={m.meta_description()} />
</svelte:head>

{@render children()}
<ToastContainer />
