<script lang='ts'>
  import type { IamPublicConfig } from '@h-ai/api-contract'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { AuthPanel } from '@h-ai/ui/components/scenes/iam/index'
  import { onMount } from 'svelte'
  import { authActions } from '../services/auth.js'
  import { refreshCurrentUser } from '../stores/auth-store.svelte.js'

  const { initialMode = 'login', resetToken = '' }: { initialMode?: 'login' | 'register' | 'forgot' | 'reset', resetToken?: string } = $props()
  let config = $state<IamPublicConfig | null>(null)
  let error = $state('')
  async function loadConfig() {
    error = ''
    const result = await authActions.publicConfig()
    if (result.success)
      config = result.data
    else
      error = result.error.message
  }
  onMount(() => {
    void loadConfig()
  })
  async function authenticated() {
    await refreshCurrentUser()
    await goto(resolve('/', {}))
  }
</script>

<AuthPanel {resetToken} {config} {error} actions={authActions} {initialMode} loginUrl='/auth/login' registerUrl='/auth/register' onretry={() => void loadConfig()} onauthenticated={authenticated} />
