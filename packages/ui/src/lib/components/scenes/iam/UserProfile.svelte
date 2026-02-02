<!--
  =============================================================================
  @hai/ui - UserProfile 组件
  =============================================================================
  用户个人信息展示/编辑组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 primitives/compounds 组件：Input, Button, Textarea, Avatar, Alert
  =============================================================================
-->
<script lang="ts">
  import type { UserProfileProps, UserProfileField } from '../types.js'
  import { cn } from '../../../utils.js'
  import Input from '../../primitives/Input.svelte'
  import BareInput from '../../primitives/BareInput.svelte'
  import Button from '../../primitives/Button.svelte'
  import Textarea from '../../primitives/Textarea.svelte'
  import Avatar from '../../primitives/Avatar.svelte'
  import Alert from '../../compounds/Alert.svelte'
  import { m } from '../../../messages.js'
  
  let {
    user,
    editable = false,
    loading = false,
    fields = ['avatar', 'username', 'email', 'nickname', 'phone'],
    class: className = '',
    errors = {},
    onsubmit,
    onavatarchange,
  }: UserProfileProps = $props()
  
  let editMode = $state(false)
  let formData = $state<Record<string, string>>({})
  
  // 初始化表单数据
  $effect(() => {
    if (user) {
      formData = {
        username: user.username || '',
        email: user.email || '',
        nickname: user.nickname || '',
        phone: user.phone || '',
        bio: user.bio || '',
      }
    }
  })
  
  const containerClass = $derived(
    cn(
      'user-profile',
      className,
    )
  )
  
  // 获取字段标签
  function getFieldLabel(field: UserProfileField): string {
    const labelMap: Record<UserProfileField, () => string> = {
      avatar: () => m('user_profile_avatar'),
      username: () => m('user_profile_username'),
      email: () => m('user_profile_email'),
      nickname: () => m('user_profile_nickname'),
      phone: () => m('user_profile_phone'),
      bio: () => m('user_profile_bio'),
    }
    return labelMap[field]?.() || field
  }
  
  function startEdit() {
    editMode = true
  }
  
  function cancelEdit() {
    editMode = false
    // 重置表单数据
    if (user) {
      formData = {
        username: user.username || '',
        email: user.email || '',
        nickname: user.nickname || '',
        phone: user.phone || '',
        bio: user.bio || '',
      }
    }
  }
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading) return
    
    await onsubmit?.(formData)
    editMode = false
  }
  
  function handleAvatarChange(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    if (file) {
      onavatarchange?.(file)
    }
  }
</script>

<div class={containerClass}>
  <form onsubmit={handleSubmit}>
    <div class="space-y-6">
      {#each fields as field (field)}
        {#if field === 'avatar'}
          <!-- 头像 -->
          <div class="flex items-center gap-4">
            <Avatar
              src={user?.avatar}
              alt={m('user_profile_avatar')}
              size="lg"
              ring
              placeholder={user?.username?.charAt(0).toUpperCase() || 'U'}
            />
            {#if editable && editMode}
              <div>
                <BareInput
                  type="file"
                  class="file-input file-input-bordered file-input-sm w-full max-w-xs"
                  accept="image/*"
                  onchange={handleAvatarChange}
                />
                <p class="text-xs text-base-content/60 mt-1">{m('user_profile_avatar_hint')}</p>
              </div>
            {/if}
          </div>
        {:else}
          <!-- 其他字段 -->
          <div class="form-control">
            <div class="label">
              <span class="label-text font-medium">{getFieldLabel(field)}</span>
            </div>
            {#if editMode && field !== 'username'}
              {#if field === 'bio'}
                <Textarea
                  name={field}
                  rows={3}
                  bind:value={formData[field]}
                  disabled={loading}
                  error={errors[field]}
                />
              {:else}
                <Input
                  type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                  name={field}
                  bind:value={formData[field]}
                  disabled={loading}
                  error={errors[field]}
                />
              {/if}
            {:else}
              <p class="py-2 px-1 text-base-content">
                {formData[field] || '-'}
              </p>
            {/if}
          </div>
        {/if}
      {/each}
      
      <!-- 通用错误 -->
      {#if errors.general}
        <Alert variant="error">
          {errors.general}
        </Alert>
      {/if}
      
      <!-- 操作按钮 -->
      {#if editable}
        <div class="flex gap-2 pt-4">
          {#if editMode}
            <Button
              type="submit"
              variant="primary"
              {loading}
              disabled={loading}
            >
              {m('user_profile_save')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onclick={cancelEdit}
              disabled={loading}
            >
              {m('user_profile_cancel')}
            </Button>
          {:else}
            <Button
              type="button"
              variant="outline"
              onclick={startEdit}
            >
              {m('user_profile_edit')}
            </Button>
          {/if}
        </div>
      {/if}
    </div>
  </form>
</div>
