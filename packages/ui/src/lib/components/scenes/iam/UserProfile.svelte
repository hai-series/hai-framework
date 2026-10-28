<!--
  @component UserProfile
  =============================================================================
  @h-ai/ui - UserProfile 组件
  =============================================================================
  用户个人信息展示/编辑组件

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 primitives/compounds 组件：Input, Button, Textarea, Avatar, Alert
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { UserProfile } from '@h-ai/ui'
  const props: ComponentProps<typeof UserProfile> = { user: { id: 'u1', username: 'ada', email: 'ada@example.com' }, fields: ['username', 'email'], editable: true }
  const component = mount(UserProfile, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { UserProfileField, UserProfileProps, UserProfileSubmitData } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
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
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    fields = ['avatar', 'username', 'email', 'displayName', 'phone'],
    fieldConstraints = {},
    avatarAccept = 'image/*',
    avatarHint,
    class: className = '',
    errors = {},
    onsubmit,
    onavatarchange,
    ...restProps
  }: UserProfileProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const avatarInputId = $props.id()
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
      e.currentTarget.value = ''
    }
  }
  useToastFeedback(() => errors.general)
  useToastFeedback(() => errors.avatar)
</script>

<div {...dataAttributes} class={containerClass}>
  <form onsubmit={handleSubmit}>
    <FormLayout {columns} {labelPosition} {labelWidth}>
      {#each fields as field (field)}
        {@const modelKey = getModelKey(field)}
        {#if field === 'avatar'}
          <!-- 头像 -->
          <div class='flex flex-wrap items-center gap-4 border-b border-base-content/8 pb-5'>
            <Avatar
              src={user?.avatarUrl ?? user?.avatar}
              alt={uiM('user_profile_avatar')}
              name={user?.displayName || user?.nickname || user?.username}
              size='lg'
              class='shadow-sm'
            />
            {#if editable && (editMode || alwaysEditable)}
              <div class='min-w-0 flex-1 basis-48'>
                <BareInput
                  id={avatarInputId}
                  type='file'
                  class='hidden'
                  accept={avatarAccept}
                  disabled={loading}
                  onchange={handleAvatarChange}
                />
                <Button type='button' variant='outline' size='sm' disabled={loading} onclick={() => document.getElementById(avatarInputId)?.click()}>{uiM('user_profile_upload_avatar')}</Button>
                {#if !errors.avatar}
                  <p class='text-xs text-base-content/60 mt-1'>{avatarHint ?? uiM('user_profile_avatar_hint')}</p>
                {/if}
              </div>
            {/if}
          </div>
        {:else}
          <!-- 其他字段 -->
          <FormField label={getFieldLabel(field)} required={fieldConstraints[field]?.required} colSpan={field === 'bio' ? 2 : 'auto'}>
            {#if editable && (editMode || alwaysEditable)}
              {#if field === 'bio'}
                <Textarea
                  {...fieldConstraints[field]}
                  name={modelKey}
                  rows={3}
                  bind:value={formData[modelKey]}
                  disabled={loading}
                  error={errors[field]}
                />
              {:else}
                <Input
                  {...fieldConstraints[field]}
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
          </FormField>
        {/if}
      {/each}

      <!-- 通用错误 -->

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
    </FormLayout>
  </form>
</div>
