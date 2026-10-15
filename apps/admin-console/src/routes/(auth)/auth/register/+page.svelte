<!--
  =============================================================================
  Admin Console - 注册页面
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

  const adminHomePath = resolve('/admin', {})
  const loginPath = resolve('/auth/login', {})

  const config = $derived({
    ...page.data.iamPublicConfig,
    ui: {
      ...page.data.iamPublicConfig.ui,
      brandTitle: page.data.iamPublicConfig.ui.brandTitle || m.app_title(),
      brandText: page.data.iamPublicConfig.ui.brandText || m.meta_description(),
    },
  })
</script>

<svelte:head>
  <title>{m.auth_register_title()} - {m.app_title()}</title>
</svelte:head>

<AuthPanel
  {config}
  {actions}
  initialMode='register'
  loginUrl={loginPath}
  onauthenticated={() => goto(adminHomePath)}
/>
