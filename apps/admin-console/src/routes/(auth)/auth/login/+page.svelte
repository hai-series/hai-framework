<!--
  =============================================================================
  Admin Console - 登录页面
  =============================================================================
  使用 @h-ai/ui 的配置驱动 AuthPanel
  =============================================================================
-->
<script lang='ts'>
  import { goto } from '$app/navigation'
  import { match, resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '#lib/paraglide/messages.js'
  import { authActions as actions } from '#lib/services/auth.js'

  const forgotPasswordPath = resolve('auth/forgot-password')
  const registerPath = resolve('auth/register')
  const returnUrl = $derived(page.url.searchParams.get('returnUrl') ?? '')
  const config = $derived({
    ...page.data.iamPublicConfig,
    ui: {
      ...page.data.iamPublicConfig.ui,
      brandTitle: page.data.iamPublicConfig.ui.brandTitle || m.app_title(),
      brandText: page.data.iamPublicConfig.ui.brandText || m.meta_description(),
    },
  })

  /**
   * 规范化登录后的跳转地址。
   * 仅允许站内受保护路径，避免开放重定向风险。
   */
  function resolveRedirectTarget(url: string) {
    const fallback = resolve('admin')
    try {
      const target = new URL(url || fallback, page.url.href)
      if (target.origin !== page.url.origin
        || (target.pathname !== fallback && !target.pathname.startsWith(`${fallback}/`))) {
        return fallback
      }
      return `${target.pathname}${target.search}${target.hash}`
    }
    catch {
      return fallback
    }
  }

  async function authenticated() {
    const target = resolveRedirectTarget(returnUrl)
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- 目标已经同源/保护路径校验并经 match 核实，包含挂载前缀；不能二次 resolve。
    await goto(await match(target)
      ? target
      : resolve('admin'))
  }
</script>

<svelte:head>
  <title>{m.auth_login_title()} - {m.app_title()}</title>
</svelte:head>

<AuthPanel
  {config}
  {actions}
  forgotPasswordUrl={forgotPasswordPath}
  registerUrl={registerPath}
  onauthenticated={authenticated}
/>
