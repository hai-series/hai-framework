<!--
  RegisterView — 通过 @h-ai/ui 的 RegisterForm 场景组件注册。
-->
<script lang='ts'>
  import type { RegisterFormData } from '@h-ai/ui'
  import { RegisterForm } from '@h-ai/ui'
  import { isLoading, register } from '../lib/auth-store.svelte.js'
  import { navigate } from '../lib/router.svelte.js'

  let errors = $state<Record<string, string>>({})

  async function handleSubmit(data: RegisterFormData): Promise<void> {
    errors = {}
    const err = await register({
      username: data.username ?? '',
      email: data.email ?? '',
      password: data.password,
    })
    if (err) {
      errors = { _form: `Register failed: ${err}` }
      return
    }
    navigate('/dashboard')
  }
</script>

<div class='bg-base-200 flex h-screen items-center justify-center'>
  <div class='card bg-base-100 w-96 shadow-xl'>
    <div class='card-body'>
      <RegisterForm
        fields={['username', 'email', 'password']}
        requireConfirmPassword={false}
        showPasswordStrength={false}
        loading={isLoading()}
        showLoginLink
        loginUrl='#/login'
        {errors}
        onsubmit={handleSubmit}
      />
    </div>
  </div>
</div>
