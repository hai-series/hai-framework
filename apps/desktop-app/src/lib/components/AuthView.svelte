<script lang='ts'>
  import type { IamPublicConfig } from '@h-ai/api-contract'
  import { LanguageSwitch } from '@h-ai/ui'
  import { AuthPanel } from '@h-ai/ui/components/scenes/iam/index'
  import { authErrorMessage } from '@h-ai/ui/i18n'
  import { onMount } from 'svelte'
  import { refreshCurrentUser } from '../auth-store.svelte.js'
  import { localeStore } from '../messages.svelte.js'
  import { navigate } from '../router.svelte.js'
  import { authActions } from '../services/auth.js'

  const { initialMode = 'login' }: { initialMode?: 'login' | 'register' } = $props()
  let config = $state<IamPublicConfig | null>(null)
  let error = $state('')
  async function loadConfig() {
    error = ''
    const result = await authActions.publicConfig()
    if (result.success)
      config = result.data
    else
      error = authErrorMessage(result.error)
  }
  onMount(() => {
    void loadConfig()
  })
  async function authenticated() {
    await refreshCurrentUser()
    navigate('/dashboard')
  }
</script>

<div class='fixed right-4 top-4 z-10'>
  <LanguageSwitch currentLanguage={localeStore.current} onchange={language => localeStore.set(language)} />
</div>

<AuthPanel {config} {error} actions={authActions} {initialMode} loginUrl='#/login' registerUrl='#/register' onretry={() => void loadConfig()} onauthenticated={authenticated} />
