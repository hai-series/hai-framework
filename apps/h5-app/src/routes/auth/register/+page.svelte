<script lang='ts'>
  import type { RegisterFormData } from '@h-ai/ui'
  /**
   * 注册页 — 使用 @h-ai/ui RegisterForm + @h-ai/iam
   */
  import { goto } from '$app/navigation'
  import * as m from '$lib/paraglide/messages.js'
  import { h5AuthTokenStore } from '$lib/utils/auth.js'

  let loading = $state(false)
  let errors: Record<string, string> = $state({})

  async function handleRegister(data: RegisterFormData) {
    loading = true
    errors = {}

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: data.username,
          email: data.email,
          password: data.password,
        }),
      })
      const result = await res.json()

      if (result.success) {
        if (result.accessToken) {
          h5AuthTokenStore.set(result.accessToken)
        }
        goto('/profile')
      }
      else {
        errors = { general: result.error?.message ?? m.auth_register_error_generic() }
      }
    }
    catch {
      errors = { general: m.auth_register_error_network() }
    }
    finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>{m.auth_register_title()} - H5</title>
</svelte:head>

<div class='min-h-screen flex flex-col bg-base-100'>
  <!-- 返回按钮 -->
  <div class='p-4'>
    <IconButton
      size='sm'
      variant='ghost'
      ariaLabel={m.auth_register_back()}
      onclick={() => goto('/')}
    >
      <span class='icon-[tabler--arrow-left] text-lg'></span>
    </IconButton>
  </div>

  <div class='flex-1 flex flex-col justify-center px-6 pb-20'>
    <h1 class='text-2xl font-bold text-center mb-2'>{m.auth_register_title()}</h1>
    <p class='text-center text-base-content/50 mb-8'>{m.auth_register_subtitle()}</p>

    <RegisterForm
      {loading}
      fields={['username', 'email', 'password']}
      showPasswordStrength={true}
      requireConfirmPassword={false}
      minPasswordLength={6}
      showLoginLink={true}
      loginUrl='/auth/login'
      {errors}
      onsubmit={handleRegister}
    />
  </div>
</div>
