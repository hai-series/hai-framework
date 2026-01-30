<!--
  =============================================================================
  @hai/ui - RegisterForm 组件
  =============================================================================
  用户注册表单组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { RegisterFormProps, RegisterFormData, RegisterField } from '../types.js'
  import { cn } from '../../../utils.js'
  import PasswordInput from './PasswordInput.svelte'
  
  let {
    loading = false,
    disabled = false,
    showPasswordStrength = true,
    requireConfirmPassword = true,
    minPasswordLength = 8,
    fields = ['username', 'email', 'password'],
    submitText = '注册',
    class: className = '',
    errors = {},
    onsubmit,
    header,
    footer,
  }: RegisterFormProps = $props()
  
  // 表单数据
  let formData = $state<Record<string, string>>({
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    nickname: '',
  })
  
  const formClass = $derived(
    cn(
      'register-form space-y-4',
      className,
    )
  )
  
  // 字段配置
  const fieldConfigs: Record<RegisterField, { label: string; type: string; placeholder: string }> = {
    username: { label: '用户名', type: 'text', placeholder: '请输入用户名' },
    email: { label: '邮箱', type: 'email', placeholder: '请输入邮箱地址' },
    phone: { label: '手机号', type: 'tel', placeholder: '请输入手机号' },
    password: { label: '密码', type: 'password', placeholder: '请输入密码' },
    confirmPassword: { label: '确认密码', type: 'password', placeholder: '请再次输入密码' },
    nickname: { label: '昵称', type: 'text', placeholder: '请输入昵称' },
  }
  
  // 检查密码是否匹配
  const passwordsMatch = $derived(
    !requireConfirmPassword || formData.password === formData.confirmPassword
  )
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled) return
    if (!passwordsMatch) return
    
    const data: RegisterFormData = {
      username: formData.username,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      nickname: formData.nickname,
    }
    
    await onsubmit?.(data)
  }
</script>

<form class={formClass} onsubmit={handleSubmit}>
  <!-- 自定义头部 -->
  {#if header}
    <div class="register-form-header">
      {@render header()}
    </div>
  {/if}
  
  <!-- 动态字段 -->
  {#each fields as field (field)}
    {#if field === 'password'}
      <div class="form-control">
        <label class="label" for="register-password">
          <span class="label-text">{fieldConfigs.password.label}</span>
        </label>
        <PasswordInput
          bind:value={formData.password}
          placeholder={fieldConfigs.password.placeholder}
          {disabled}
          error={errors.password}
          showStrength={showPasswordStrength}
          minLength={minPasswordLength}
        />
      </div>
      
      {#if requireConfirmPassword}
        <div class="form-control">
          <label class="label" for="register-confirm-password">
            <span class="label-text">{fieldConfigs.confirmPassword.label}</span>
          </label>
          <PasswordInput
            bind:value={formData.confirmPassword}
            placeholder={fieldConfigs.confirmPassword.placeholder}
            {disabled}
            error={errors.confirmPassword || (!passwordsMatch && formData.confirmPassword ? '两次密码输入不一致' : '')}
            showStrength={false}
            showToggle={true}
          />
        </div>
      {/if}
    {:else}
      {@const config = fieldConfigs[field]}
      {#if config}
        <div class="form-control">
          <label class="label" for="register-{field}">
            <span class="label-text">{config.label}</span>
          </label>
          <input
            id="register-{field}"
            type={config.type}
            name={field}
            placeholder={config.placeholder}
            class={cn('input input-bordered w-full', errors[field] && 'input-error')}
            bind:value={formData[field]}
            {disabled}
            required={field === 'username' || field === 'email'}
          />
          {#if errors[field]}
            <label class="label">
              <span class="label-text-alt text-error">{errors[field]}</span>
            </label>
          {/if}
        </div>
      {/if}
    {/if}
  {/each}
  
  <!-- 通用错误 -->
  {#if errors.general}
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{errors.general}</span>
    </div>
  {/if}
  
  <!-- 提交按钮 -->
  <button
    type="submit"
    class="btn btn-primary w-full"
    disabled={loading || disabled || !passwordsMatch}
  >
    {#if loading}
      <span class="loading loading-spinner loading-sm"></span>
    {/if}
    {submitText}
  </button>
  
  <!-- 自定义底部 -->
  {#if footer}
    <div class="register-form-footer">
      {@render footer()}
    </div>
  {/if}
</form>
