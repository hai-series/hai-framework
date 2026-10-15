<!--
  =============================================================================
  Admin Console - 登录页面
  =============================================================================
  使用 @h-ai/ui 的配置驱动 AuthPanel
  =============================================================================
-->
<script lang='ts'>
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'
  import { authActions as actions } from '$lib/services/auth'

  const forgotPasswordPath = resolve('/auth/forgot-password', {})
  const registerPath = resolve('/auth/register', {})
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
    if (!url) {
      return '/admin'
    }

    if (!url.startsWith('/') || url.startsWith('//')) {
      return '/admin'
    }

    if (!url.startsWith('/admin')) {
      return '/admin'
    }

    return url
  }

  async function authenticated() {
    await goto(resolve(resolveRedirectTarget(returnUrl), {}))
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
