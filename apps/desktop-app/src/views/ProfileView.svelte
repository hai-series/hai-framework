<!--
  ProfileView — 当前用户信息展示 + 修改用户名/邮箱。使用 @h-ai/ui 的 UserProfile 场景组件 + Toast 提示。
-->
<script lang='ts'>
  import type { UserProfileSubmitData } from '@h-ai/ui'
  import { PageHeader, toast, UserProfile } from '@h-ai/ui'
  import { desktopApiClient } from '../lib/api.js'
  import { currentUser, refreshCurrentUser } from '../lib/auth-store.svelte.js'

  const me = $derived(currentUser())
  let saving = $state(false)
  let errors = $state<Record<string, string>>({})

  async function handleSave(data: UserProfileSubmitData): Promise<void> {
    saving = true
    errors = {}
    const result = await desktopApiClient.iam.auth.updateCurrentUser({
      username: data.username,
      email: data.email,
    })
    if (result.success) {
      toast.success('Profile updated')
      await refreshCurrentUser()
    }
    else {
      const code = String(result.error.code ?? 'unknown')
      errors = { general: `Update failed: ${code}` }
      toast.error(`Update failed: ${code}`)
    }
    saving = false
  }
</script>

<div class='flex flex-col gap-4'>
  <PageHeader title='Profile' description='Manage your account information' />

  {#if me}
    <UserProfile
      user={{ id: me.id, username: me.username, email: me.email ?? undefined }}
      editable
      alwaysEditable
      fields={['username', 'email']}
      loading={saving}
      {errors}
      class='max-w-2xl'
      onsubmit={handleSave}
    />
  {/if}
</div>
