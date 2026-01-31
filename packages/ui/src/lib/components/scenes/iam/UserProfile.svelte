<!--
  =============================================================================
  @hai/ui - UserProfile 组件
  =============================================================================
  用户个人信息展示/编辑组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { UserProfileProps, UserProfileField } from '../types.js'
  import { cn } from '../../../utils.js'
  
  const defaultLabels = {
    avatar: 'Avatar',
    username: 'Username',
    email: 'Email',
    nickname: 'Nickname',
    phone: 'Phone',
    bio: 'Bio',
    avatarHint: 'JPG, PNG supported, max 2MB',
    save: 'Save',
    cancel: 'Cancel',
    editProfile: 'Edit Profile',
  }
  
  let {
    user,
    editable = false,
    loading = false,
    fields = ['avatar', 'username', 'email', 'nickname', 'phone'],
    labels = {},
    class: className = '',
    errors = {},
    onsubmit,
    onavatarchange,
  }: UserProfileProps = $props()
  
  const mergedLabels = $derived({ ...defaultLabels, ...labels })
  
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
  
  // 通过 mergedLabels 获取字段标签
  function getFieldLabel(field: UserProfileField): string {
    return mergedLabels[field] || field
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
            <div class="avatar">
              <div class="w-20 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                {#if user?.avatar}
                  <img src={user.avatar} alt={mergedLabels.avatar} />
                {:else}
                  <div class="bg-neutral text-neutral-content flex items-center justify-center text-2xl">
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                {/if}
              </div>
            </div>
            {#if editable && editMode}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  class="file-input file-input-bordered file-input-sm w-full max-w-xs"
                  onchange={handleAvatarChange}
                />
                <p class="text-xs text-base-content/60 mt-1">{mergedLabels.avatarHint}</p>
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
                <textarea
                  name={field}
                  class={cn('textarea textarea-bordered', errors[field] && 'textarea-error')}
                  rows={3}
                  bind:value={formData[field]}
                  disabled={loading}
                ></textarea>
              {:else}
                <input
                  type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                  name={field}
                  class={cn('input input-bordered', errors[field] && 'input-error')}
                  bind:value={formData[field]}
                  disabled={loading}
                />
              {/if}
              {#if errors[field]}
                <div class="label">
                  <span class="label-text-alt text-error">{errors[field]}</span>
                </div>
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
        <div class="alert alert-error">
          <span>{errors.general}</span>
        </div>
      {/if}
      
      <!-- 操作按钮 -->
      {#if editable}
        <div class="flex gap-2 pt-4">
          {#if editMode}
            <button
              type="submit"
              class="btn btn-primary"
              disabled={loading}
            >
              {#if loading}
                <span class="loading loading-spinner loading-sm"></span>
              {/if}
              {mergedLabels.save}
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              onclick={cancelEdit}
              disabled={loading}
            >
              {mergedLabels.cancel}
            </button>
          {:else}
            <button
              type="button"
              class="btn btn-outline"
              onclick={startEdit}
            >
              {mergedLabels.editProfile}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </form>
</div>

<style>
  .avatar > div {
    @apply flex items-center justify-center;
  }
</style>
