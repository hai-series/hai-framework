<script lang='ts'>
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { authActions } from '$lib/services/auth'
  import { AuthPanel } from '@h-ai/ui/components/scenes/iam/index'
</script>

<AuthPanel config={page.data.iamPublicConfig} actions={authActions} initialMode='login' loginUrl={resolve('/auth/login', {})} registerUrl={resolve('/auth/register', {})} onauthenticated={() => goto(resolve('/profile', {}))} />
