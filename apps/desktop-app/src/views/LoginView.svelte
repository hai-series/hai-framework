<!--
  LoginView — 通过 @h-ai/ui 的 LoginForm 场景组件登录。
  调用 auth-store 的 `login`，成功后跳转 `/dashboard`，失败时通过 errors 展示。
-->
<script lang='ts'>
  import type { LoginFormData } from '@h-ai/ui'
  import { LoginForm } from '@h-ai/ui'
  import { isLoading, login } from '../lib/auth-store.svelte.js'
  import { navigate } from '../lib/router.svelte.js'

  let errors = $state<Record<string, string>>({})

  async function handleSubmit(data: LoginFormData): Promise<void> {
    errors = {}
    const err = await login({ identifier: data.username, password: data.password })
    if (err) {
      errors = { _form: `Login failed: ${err}` }
      return
    }
    navigate('/dashboard')
  }
</script>

<div class='bg-base-200 flex h-screen items-center justify-center'>
  <div class='card bg-base-100 w-96 shadow-xl'>
    <div class='card-body'>
      <LoginForm
        loading={isLoading()}
        showRememberMe={false}
        showForgotPassword={false}
        showRegisterLink
        registerUrl='#/register'
        {errors}
        onsubmit={handleSubmit}
      />
    </div>
  </div>
</div>
