<script lang="ts">
  import { goto } from '$app/navigation'
  import { corporateAuthTokenStore } from '$lib/utils/auth.js'
  import { Alert, Button, Card, FormField, Input, PasswordInput } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages.js'

  let username = $state('')
  let password = $state('')
  let loading = $state(false)
  let error = $state('')

  async function handleLogin(event: Event) {
    event.preventDefault()
    loading = true
    error = ''

    try {
      const formData = new FormData()
      formData.append('username', username)
      formData.append('password', password)

      const response = await fetch('/api/partners/admin/login', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!data.success) {
        error = data.error?.message ?? m.admin_login_failed()
        return
      }

      if (data.accessToken) {
        corporateAuthTokenStore.set(data.accessToken)
      }

      await goto('/partners/admin')
    }
    catch {
      error = m.admin_network_error()
    }
    finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.nav_partner_admin()} - {m.brand()}</title>
</svelte:head>

<section class="flex min-h-[60vh] items-center justify-center py-20 px-4">
  <div class="w-full max-w-md">
    <Card shadow="sm">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
          <span class="icon-[tabler--lock] size-5 text-primary"></span>
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight text-base-content">{m.nav_partner_admin()}</h1>
          <p class="text-sm text-base-content/50">{m.admin_login_subtitle()}</p>
        </div>
      </div>

      {#if error}
        <Alert variant="error" dismissible class="mb-4">
          {error}
        </Alert>
      {/if}

      <form class="grid gap-4" onsubmit={handleLogin}>
        <FormField label={m.admin_login_username()} required>
          <Input id="admin-username" bind:value={username} required />
        </FormField>

        <FormField label={m.admin_login_password()} required>
          <PasswordInput id="admin-password" bind:value={password} required showStrength={false} />
        </FormField>

        <Button type="submit" variant="primary" class="mt-2" loading={loading} disabled={loading}>
          {#if loading}
            {m.admin_login_loading()}
          {:else}
            {m.admin_login_submit()}
          {/if}
        </Button>
      </form>
    </Card>
  </div>
</section>
