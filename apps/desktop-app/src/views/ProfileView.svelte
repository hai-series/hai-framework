<!--
  ProfileView — 当前用户信息展示 + 修改用户名/邮箱。使用 @h-ai/ui 的 UserProfile 场景组件 + Toast 提示。
-->
<script lang='ts'>
  import type { UserProfileSubmitData } from '@h-ai/ui'
  import { PageHeader, toast, UserProfile } from '@h-ai/ui'
  import { desktopApiClient } from '../lib/api.js'
  import { currentUser, refreshCurrentUser } from '../lib/auth-store.svelte.js'
  import { desktopM as m } from '../lib/messages.svelte.js'

  const me = $derived(currentUser())
  let saving = $state(false)
  let errors = $state<Record<string, string>>({})

  /** 保存用户资料；只有服务端确认成功才返回 true，失败保留编辑草稿。 */
  async function handleSave(data: UserProfileSubmitData): Promise<boolean> {
    saving = true
    errors = {}
    try {
      const result = await desktopApiClient.iam.auth.updateCurrentUser({
        username: data.username,
        email: data.email,
      })
      if (result.success) {
        toast.success(m('profile_updated'))
        await refreshCurrentUser()
      }
      else {
        const code = String(result.error.code ?? 'unknown')
        errors = {
          general: m('profile_update_failed', { code }),
        }
      }
      return result.success
    }
    finally {
      saving = false
    }
  }
</script>

<div class='flex flex-col gap-4'>
  <PageHeader title={m('nav_profile')} description={m('profile_description')} />

  {#if me}
    <UserProfile
      columns={2}
      labelPosition='left'
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
