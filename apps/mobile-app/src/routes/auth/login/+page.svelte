<script lang='ts'>
  import type { LoginFormData } from '@h-ai/ui'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'
  import { isLoading, login } from '$lib/stores/auth-store.svelte.js'

  let errors = $state<Record<string, string>>({})

  async function handleSubmit(data: LoginFormData): Promise<void> {
    errors = {}
    const error = await login({ identifier: data.username, password: data.password })
    if (error) {
      errors = { general: m.auth_login_failed({ message: error }) }
      return
    }

    await goto(resolve('/', {}))
  }
</script>

<svelte:head>
  <title>{m.auth_login_title()} - {m.app_title()}</title>
</svelte:head>

<div class='hai-mobile-viewport'>
  <div class='hai-mobile-shell max-w-lg'>
    <div class='flex min-h-screen flex-col bg-base-100'>
      <div class='p-4'>
        <Button variant='ghost' size='sm' ariaLabel={m.common_back()} onclick={() => goto(resolve('/', {}))}>
          <span class='icon-[tabler--arrow-left] text-lg'></span>
        </Button>
      </div>

      <div class='flex flex-1 flex-col justify-center px-6 pb-20'>
        <h1 class='text-center text-2xl font-bold'>{m.auth_login_title()}</h1>
        <p class='text-base-content/50 mb-8 mt-2 text-center'>{m.auth_login_subtitle()}</p>

        <LoginForm
          loading={isLoading()}
          showRememberMe={false}
          showForgotPassword={false}
          showRegisterLink
          registerUrl={resolve('/auth/register', {})}
          {errors}
          onsubmit={handleSubmit}
        />
      </div>
    </div>
  </div>
</div>
