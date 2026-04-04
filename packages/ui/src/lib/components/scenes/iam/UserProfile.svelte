<!--
  =============================================================================
  @h-ai/ui - UserProfile 组件
  =============================================================================
  用户个人信息展示/编辑组件

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 primitives/compounds 组件：Input, Button, Textarea, Avatar, Alert
  =============================================================================
-->
<script lang='ts'>
  import type { UserProfileField, UserProfileProps, UserProfileSubmitData } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import Alert from '../../compounds/Alert.svelte'
  import Avatar from '../../primitives/Avatar.svelte'
  import BareInput from '../../primitives/BareInput.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import Textarea from '../../primitives/Textarea.svelte'

  const {
    user,
    editable = false,
    alwaysEditable = false,
    loading = false,
    fields = ['avatar', 'username', 'email', 'displayName', 'phone'],
    class: className = '',
    errors = {},
    onsubmit,
    onavatarchange,
  }: UserProfileProps = $props()

  let editMode = $state(false)
  let formData = $state<UserProfileSubmitData>({
    username: '',
    email: '',
    displayName: '',
    phone: '',
    bio: '',
  })

  // 初始化表单数据
  $effect(() => {
    if (user) {
      formData = {
        username: user.username || '',
        email: user.email || '',
        displayName: user.displayName || user.nickname || '',
        phone: user.phone || '',
        bio: user.bio || '',
      }
    }
  })

  const containerClass = $derived(
    cn(
      'user-profile',
      className,
    ),
  )

  // 获取字段标签
  function getFieldLabel(field: UserProfileField): string {
    const labelMap: Record<UserProfileField, () => string> = {
      avatar: () => uiM('user_profile_avatar'),
      username: () => uiM('user_profile_username'),
      email: () => uiM('user_profile_email'),
      nickname: () => uiM('user_profile_nickname'),
      displayName: () => uiM('user_profile_display_name'),
      phone: () => uiM('user_profile_phone'),
      bio: () => uiM('user_profile_bio'),
    }
    return labelMap[field]?.() || field
  }

  /**
   * 将展示字段名映射为提交数据字段名。
   *
   * @param field 展示字段名
   * @returns 提交数据中的字段名
   */
  function getModelKey(field: UserProfileField): keyof UserProfileSubmitData {
    if (field === 'nickname' || field === 'displayName') {
      return 'displayName'
    }
    if (field === 'email') {
      return 'email'
    }
    if (field === 'phone') {
      return 'phone'
    }
    if (field === 'bio') {
      return 'bio'
    }
    return 'username'
  }

  /**
   * 进入编辑态（仅 alwaysEditable=false 时生效）。
   */
  function startEdit() {
    editMode = true
  }

  /**
   * 退出编辑态，并使用当前用户数据重置表单。
   */
  function cancelEdit() {
    editMode = false
    // 重置表单数据
    if (user) {
      formData = {
        username: user.username || '',
        email: user.email || '',
        displayName: user.displayName || user.nickname || '',
        phone: user.phone || '',
        bio: user.bio || '',
      }
    }
  }

  /**
   * 提交资料数据，成功后退出编辑态。
   *
   * @param e 表单提交事件
   * @returns 无返回值
   */
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading)
      return

    await onsubmit?.(formData)
    editMode = false
  }

  /**
   * 将选中的头像文件透传给父组件回调。
   *
   * @param e 文件输入事件
   */
  function handleAvatarChange(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    if (file) {
      onavatarchange?.(file)
    }
  }
</script>

<div class={containerClass}>
  <form onsubmit={handleSubmit}>
    <div class='space-y-6'>
      {#each fields as field (field)}
        {@const modelKey = getModelKey(field)}
        {#if field === 'avatar'}
          <!-- 头像 -->
          <div class='flex items-center gap-4'>
            <Avatar
              src={user?.avatarUrl ?? user?.avatar}
              alt={uiM('user_profile_avatar')}
              size='lg'
              ring
              class='shadow-sm'
              placeholder={user?.username?.charAt(0).toUpperCase() || 'U'}
            />
            {#if editable && (editMode || alwaysEditable)}
              <div>
                <BareInput
                  type='file'
                  class='file-input file-input-sm w-full max-w-xs'
                  accept='image/*'
                  onchange={handleAvatarChange}
                />
                <p class='text-xs text-base-content/60 mt-1'>{uiM('user_profile_avatar_hint')}</p>
              </div>
            {/if}
          </div>
        {:else}
          <!-- 其他字段 -->
          <div class='fieldset'>
            <legend class='fieldset-legend font-medium'>{getFieldLabel(field)}</legend>
            {#if editable && (editMode || alwaysEditable)}
              {#if field === 'bio'}
                <Textarea
                  name={modelKey}
                  rows={3}
                  bind:value={formData[modelKey]}
                  disabled={loading}
                  error={errors[field]}
                />
              {:else}
                <Input
                  type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                  name={modelKey}
                  bind:value={formData[modelKey]}
                  disabled={loading}
                  error={errors[field]}
                />
              {/if}
            {:else}
              <p class='py-2 px-1 text-base-content'>
                {formData[modelKey] || '-'}
              </p>
            {/if}
          </div>
        {/if}
      {/each}

      <!-- 通用错误 -->
      {#if errors.general}
        <Alert variant='error'>
          {errors.general}
        </Alert>
      {/if}

      <!-- 操作按钮 -->
      {#if editable}
        <div class='flex gap-2 pt-4'>
          {#if editMode || alwaysEditable}
            <Button
              type='submit'
              variant='primary'
              {loading}
              disabled={loading}
            >
              {uiM('user_profile_save')}
            </Button>
            <Button
              type='button'
              variant='ghost'
              onclick={cancelEdit}
              disabled={loading}
            >
              {uiM('user_profile_cancel')}
            </Button>
          {/if}
          {#if !editMode && !alwaysEditable}
            <Button
              type='button'
              variant='outline'
              onclick={startEdit}
            >
              {uiM('user_profile_edit')}
            </Button>
          {/if}
        </div>
      {/if}
    </div>
  </form>
</div>
