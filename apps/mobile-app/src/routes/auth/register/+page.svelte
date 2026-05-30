<script lang='ts'>
  import type { RegisterFormData } from '@h-ai/ui'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'
  import { isLoading, register } from '$lib/stores/auth-store.svelte.js'

  let errors = $state<Record<string, string>>({})

  async function handleSubmit(data: RegisterFormData): Promise<void> {
    errors = {}
    const error = await register({
      username: data.username ?? '',
      email: data.email ?? '',
      password: data.password,
    })
    if (error) {
      errors = { general: m.auth_register_failed({ message: error }) }
      return
    }

    await goto(resolve('/', {}))
  }
</script>

<svelte:head>
  <title>{m.auth_register_title()} - {m.app_title()}</title>
</svelte:head>

<div class='hai-mobile-viewport'>
  <div class='hai-mobile-shell max-w-lg'>
    <div class='flex min-h-screen flex-col bg-base-100'>
      <div class='p-4'>
        <Button variant='ghost' size='sm' ariaLabel={m.common_back()} onclick={() => goto(resolve('/auth/login', {}))}>
          <span class='icon-[tabler--arrow-left] text-lg'></span>
        </Button>
      </div>

      <div class='flex flex-1 flex-col justify-center px-6 pb-20'>
        <h1 class='text-center text-2xl font-bold'>{m.auth_register_title()}</h1>
        <p class='text-base-content/50 mb-8 mt-2 text-center'>{m.auth_register_subtitle()}</p>

        <RegisterForm
          fields={['username', 'email', 'password']}
          requireConfirmPassword={false}
          showPasswordStrength
          minPasswordLength={6}
          loading={isLoading()}
          showLoginLink
          loginUrl={resolve('/auth/login', {})}
          {errors}
          onsubmit={handleSubmit}
        />
      </div>
    </div>
  </div>
</div>
