<script lang='ts'>
  import type { ChangePasswordFormData, UserProfileSubmitData } from '@h-ai/ui'
  import type { PageData } from './$types'
  import { invalidateAll } from '$app/navigation'
  import * as m from '$lib/paraglide/messages.js'
  import { changeProfilePassword, updateProfile, uploadProfileAvatar } from '$lib/services/profile-api'
  import { toast } from '@h-ai/ui'
  import { authErrorMessage } from '@h-ai/ui/i18n'

  interface Props {
    data: PageData
  }

  const { data }: Props = $props()

  // 从 IAM 配置读取密码最小长度（通过 layout server data 传递）
  const MIN_PASSWORD_LENGTH = $derived(data.iamPublicConfig?.password?.minLength ?? 8)

  /**
   * 将接口返回的 profile 结构转换为页面使用的用户模型。
   *
   * @param profile 页面加载返回的资料对象
   * @returns 页面展示与提交使用的用户模型
   */
  function toProfileUser(profile: PageData['profile']) {
    return {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      displayName: profile.display_name,
      phone: profile.phone,
      avatarUrl: profile.avatar,
    }
  }

  /**
   * 将服务端字段名映射到 UI 组件字段名。
   *
   * @param fieldErrors 服务端字段错误集合
   * @returns 组件可直接消费的字段错误对象
   */
  function normalizeProfileFieldErrors(fieldErrors: Record<string, string> | undefined) {
    if (!fieldErrors) {
      return {}
    }

    const mapped: Record<string, string> = {}
    for (const [field, message] of Object.entries(fieldErrors)) {
      if (field === 'display_name') {
        mapped.displayName = message
      }
      else if (field === 'avatar') {
        mapped.avatar = message
      }
      else if (field === 'phone' || field === 'email' || field === 'username' || field === 'general') {
        mapped[field] = message
      }
    }
    return mapped
  }

  let profileUser = $derived(toProfileUser(data.profile))

  let profileErrors = $state<Record<string, string>>({})
  let passwordErrors = $state<Record<string, string>>({})

  let profileLoading = $state(false)
  let passwordLoading = $state(false)

  /**
   * 通过资料接口持久化保存个人信息。
   *
   * @param payload 需要更新的资料字段
   * @returns 接口响应对象与响应体
   */
  async function saveProfile(payload: {
    username?: string
    display_name?: string
    email?: string
    phone?: string
    avatar?: string
  }) {
    const response = await updateProfile(payload)
    const body = await response.json()
    return { response, body }
  }

  /**
   * 先上传头像文件，再将返回的头像地址保存到资料信息。
   *
   * @param file 用户选择的头像文件
   * @returns 无返回值
   */
  async function handleAvatarChange(file: File) {
    if (profileLoading) {
      return
    }

    profileLoading = true
    profileErrors = {}

    try {
      const uploadResponse = await uploadProfileAvatar(file)
      const uploadBody = await uploadResponse.json()
      if (!uploadResponse.ok || !uploadBody.success) {
        profileErrors = { avatar: uploadBody.error?.message ?? m.common_error() }
        return
      }

      const { response, body } = await saveProfile({
        avatar: uploadBody.data?.avatar,
      })
      if (!response.ok || !body.success) {
        profileErrors = { general: body.error?.message ?? m.common_error() }
        return
      }

      profileUser = {
        ...profileUser,
        avatarUrl: body.data?.user?.avatar ?? uploadBody.data?.avatar,
      }
      await invalidateAll()
      toast.success(m.common_success())
    }
    catch {
      profileErrors = { general: m.common_network_error() }
    }
    finally {
      profileLoading = false
    }
  }

  /**
   * 进行前端校验并提交资料表单。
   *
   * @param formData 资料表单数据
   * @returns 无返回值
   */
  async function handleProfileSubmit(formData: UserProfileSubmitData) {
    if (profileLoading) {
      return
    }

    profileLoading = true
    profileErrors = {}

    const username = formData.username?.trim() || undefined
    const email = formData.email?.trim() || undefined

    try {
      const { response, body } = await saveProfile({
        username,
        display_name: formData.displayName?.trim() || undefined,
        email,
        phone: formData.phone?.trim() || undefined,
        avatar: profileUser.avatarUrl?.trim() || undefined,
      })

      if (!response.ok || !body.success) {
        profileErrors = {
          ...normalizeProfileFieldErrors(body.error?.details?.fieldErrors),
          general: body.error?.message ?? m.common_error(),
        }
        return
      }

      profileUser = {
        ...profileUser,
        username: body.data?.user?.username ?? '',
        email: body.data?.user?.email ?? '',
        displayName: body.data?.user?.display_name ?? '',
        phone: body.data?.user?.phone ?? '',
        avatarUrl: body.data?.user?.avatar ?? '',
      }
      await invalidateAll()
      toast.success(m.common_success())
    }
    catch {
      profileErrors = { general: m.common_network_error() }
    }
    finally {
      profileLoading = false
    }
  }

  /**
   * 进行前端校验并提交改密表单。
   *
   * @param formData 改密表单数据
   * @returns 无返回值
   */
  async function handlePasswordSubmit(formData: ChangePasswordFormData) {
    if (passwordLoading) {
      return
    }

    passwordLoading = true
    passwordErrors = {}

    if (!formData.oldPassword) {
      passwordErrors = { oldPassword: m.api_common_required_fields() }
      passwordLoading = false
      return
    }

    if (formData.newPassword.length < MIN_PASSWORD_LENGTH) {
      passwordErrors = { newPassword: m.api_auth_password_too_short() }
      passwordLoading = false
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      passwordErrors = { confirmPassword: m.api_auth_password_mismatch() }
      passwordLoading = false
      return
    }

    try {
      const result = await changeProfilePassword({
        old_password: formData.oldPassword,
        new_password: formData.newPassword,
        confirm_password: formData.confirmPassword,
      })

      if (!result.success) {
        passwordErrors = { general: authErrorMessage(result.error) }
        return
      }

      toast.success(m.common_success())
      if (result.data.reloginRequired && typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.location.assign('/auth/login')
        }, 300)
      }
    }
    catch {
      passwordErrors = { general: m.common_network_error() }
    }
    finally {
      passwordLoading = false
    }
  }
</script>

<svelte:head>
  <title>{m.nav_profile()} - {m.app_title()}</title>
</svelte:head>

<div class='w-full min-w-0 space-y-4'>
  <PageHeader title={m.nav_profile()} description={m.settings_subtitle()} class='mb-0'>
    {#snippet actions()}
      <div class='badge badge-outline h-7 px-2.5 text-xs' data-testid='profile-roles'>
        {data.profile.roles.join(', ') || '-'}
      </div>
    {/snippet}
  </PageHeader>

  <div class='grid grid-cols-1 items-start gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]'>
    <aside class='card hidden bg-base-100 border border-base-content/6 rounded-xl xl:block'>
      <div class='card-body gap-4'>
        <div class='flex items-center gap-3 pb-2 border-b border-base-content/6'>
          <Avatar
            name={profileUser.displayName || profileUser.username || 'Admin'}
            src={profileUser.avatarUrl}
            size='lg'
            ring
          />
          <div class='min-w-0'>
            <p class='text-sm font-semibold text-base-content truncate'>{profileUser.displayName || profileUser.username || '-'}</p>
            <p class='text-xs text-base-content/45 truncate'>@{profileUser.username || '-'}</p>
          </div>
        </div>
        <div class='space-y-1'>
          <p class='text-xs uppercase tracking-wider text-base-content/40'>{m.iam_users_form_username()}</p>
          <p class='text-base font-semibold text-base-content' data-testid='profile-username'>{profileUser.username || '-'}</p>
        </div>
        <div class='space-y-1'>
          <p class='text-xs uppercase tracking-wider text-base-content/40'>{m.iam_users_form_display_name()}</p>
          <p class='text-sm text-base-content'>{profileUser.displayName || '-'}</p>
        </div>
        <div class='space-y-1'>
          <p class='text-xs uppercase tracking-wider text-base-content/40'>{m.iam_users_form_email()}</p>
          <p class='text-sm text-base-content/70 break-all' data-testid='profile-email'>{profileUser.email || '-'}</p>
        </div>
      </div>
    </aside>

    <section class='card min-w-0 bg-base-100 border border-base-content/6 rounded-xl' data-guide='admin-profile-form'>
      <div class='card-body gap-4'>
        <div class='flex items-center justify-between'>
          <h2 class='text-sm font-semibold text-base-content'>{m.nav_profile()}</h2>
        </div>

        <UserProfile
          columns={2}
          user={profileUser}
          editable
          alwaysEditable
          fields={['avatar', 'username', 'email', 'displayName', 'phone']}
          fieldConstraints={{
            username: { pattern: '\\w{3,20}', validationMessage: () => m.api_auth_username_format_invalid() },
            email: { pattern: '[^\\s@]+@[^\\s@][^\\s.@]*\\.[^\\s@]+', validationMessage: () => m.api_auth_email_invalid() },
          }}
          errors={profileErrors}
          loading={profileLoading}
          onsubmit={handleProfileSubmit}
          onavatarchange={handleAvatarChange}
        />
      </div>
    </section>
  </div>

  <section class='card bg-base-100 border border-base-content/6 rounded-xl overflow-hidden' data-testid='profile-password-card' data-guide='admin-password'>
    <div class='grid grid-cols-1 lg:grid-cols-12'>
      <aside class='lg:col-span-4 bg-base-content/2 border-b lg:border-b-0 lg:border-r border-base-content/6 p-5 space-y-4'>
        <div>
          <h2 class='text-sm font-semibold text-base-content'>{m.iam_users_form_password()}</h2>
          <p class='text-xs text-base-content/50 mt-1.5'>
            {m.profile_password_security_desc()}
          </p>
        </div>
        <div class='rounded-lg bg-base-100 px-4 py-3'>
          <p class='text-xs font-medium text-base-content/70 mb-2'>{m.profile_password_rules_title()}</p>
          <ul class='text-xs text-base-content/70 space-y-1'>
            <li>{m.profile_password_rule_min_length({ minLength: MIN_PASSWORD_LENGTH })}</li>
            <li>{m.profile_password_rule_not_same()}</li>
            <li>{m.profile_password_rule_confirm_match()}</li>
          </ul>
        </div>
      </aside>

      <div class='lg:col-span-8 p-6 lg:p-8'>
        <ChangePasswordForm
          passwordPolicy={data.iamPublicConfig?.password}
          class='w-full'
          loading={passwordLoading}
          errors={passwordErrors}
          minPasswordLength={MIN_PASSWORD_LENGTH}
          onsubmit={handlePasswordSubmit}
        />
      </div>
    </div>
  </section>
</div>
