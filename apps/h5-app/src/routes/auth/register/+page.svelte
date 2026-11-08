<script lang='ts'>
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { AuthPanel } from '@h-ai/ui/components/scenes/iam/index'
  import { authActions } from '#lib/services/auth.js'
</script>

<AuthPanel config={page.data.iamPublicConfig} actions={authActions} initialMode='register' loginUrl={resolve('auth/login')} registerUrl={resolve('auth/register')} onauthenticated={() => goto(resolve('profile'))} />
