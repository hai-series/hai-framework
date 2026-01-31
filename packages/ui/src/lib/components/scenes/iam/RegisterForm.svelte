<!--
  =============================================================================
  @hai/ui - RegisterForm 组件
  =============================================================================
  用户注册表单组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  直接使用原生 input 元素，避免组件嵌套导致的状态同步问题
  =============================================================================
-->
<script lang="ts">
  import type { RegisterFormProps, RegisterFormData, RegisterField } from '../types.js'
  import { cn } from '../../../utils.js'
  
  // 默认标签和占位符（英文作为 fallback）
  const defaultLabels: Record<RegisterField, string> = {
    username: 'Username',
    email: 'Email',
    phone: 'Phone',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    nickname: 'Nickname',
  }
  
  const defaultPlaceholders: Record<RegisterField, string> = {
    username: 'Enter username',
    email: 'Enter email address',
    phone: 'Enter phone number',
    password: 'Enter password',
    confirmPassword: 'Re-enter password',
    nickname: 'Enter nickname',
  }
  
  const defaultStrengthLabels = {
    weak: 'Weak',
    medium: 'Fair',
    strong: 'Strong',
    veryStrong: 'Very Strong',
    label: 'Password strength',
  }
  
  const defaultToggleLabels = {
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  }
  
  let {
    loading = false,
    disabled = false,
    showPasswordStrength = true,
    requireConfirmPassword = true,
    minPasswordLength = 8,
    fields = ['username', 'email', 'password'],
    submitText = 'Register',
    validationMessages = {},
    labels = {},
    placeholders = {},
    strengthLabels = {},
    toggleLabels = {},
    class: className = '',
    errors = {},
    onsubmit,
    header,
    footer,
  }: RegisterFormProps = $props()
  
  // 合并后的标签和占位符
  const mergedLabels = $derived({ ...defaultLabels, ...labels })
  const mergedPlaceholders = $derived({ ...defaultPlaceholders, ...placeholders })
  const mergedStrengthLabels = $derived({ ...defaultStrengthLabels, ...strengthLabels })
  const mergedToggleLabels = $derived({ ...defaultToggleLabels, ...toggleLabels })
  
  // 表单数据
  let username = $state('')
  let email = $state('')
  let phone = $state('')
  let password = $state('')
  let confirmPassword = $state('')
  let nickname = $state('')
  
  // 密码可见性
  let showPassword = $state(false)
  let showConfirmPassword = $state(false)
  
  const formClass = $derived(
    cn(
      'register-form space-y-4',
      className,
    )
  )
  
  // 字段配置
  const fieldConfigs = $derived<Record<RegisterField, { label: string; type: string; placeholder: string }>>({
    username: { label: mergedLabels.username, type: 'text', placeholder: mergedPlaceholders.username },
    email: { label: mergedLabels.email, type: 'email', placeholder: mergedPlaceholders.email },
    phone: { label: mergedLabels.phone, type: 'tel', placeholder: mergedPlaceholders.phone },
    password: { label: mergedLabels.password, type: 'password', placeholder: mergedPlaceholders.password },
    confirmPassword: { label: mergedLabels.confirmPassword, type: 'password', placeholder: mergedPlaceholders.confirmPassword },
    nickname: { label: mergedLabels.nickname, type: 'text', placeholder: mergedPlaceholders.nickname },
  })
  
  // 检查密码是否匹配
  const passwordsMatch = $derived(
    !requireConfirmPassword || password === confirmPassword
  )
  
  // 确认密码错误提示（使用 i18n 消息）
  const defaultPasswordMismatchMsg = 'Passwords do not match'
  const confirmPasswordError = $derived(
    errors.confirmPassword || (!passwordsMatch && confirmPassword.length > 0 
      ? (validationMessages.passwordMismatch || defaultPasswordMismatchMsg) 
      : '')
  )
  
  // 处理 invalid 事件（设置自定义验证消息）
  function handleInvalid(e: Event, field: RegisterField) {
    const input = e.currentTarget as HTMLInputElement
    if (input.validity.valueMissing && validationMessages.required) {
      input.setCustomValidity(validationMessages.required)
    } else if (input.validity.typeMismatch && field === 'email' && validationMessages.email) {
      input.setCustomValidity(validationMessages.email)
    } else {
      input.setCustomValidity('')
    }
  }
  
  // 计算密码强度（使用 i18n 标签）
  const passwordStrength = $derived.by(() => {
    if (!password) return { score: 0, label: '', color: '' }
    
    let score = 0
    
    if (password.length >= minPasswordLength) score += 1
    if (password.length >= 12) score += 1
    if (/[a-z]/.test(password)) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^a-zA-Z0-9]/.test(password)) score += 1
    
    if (score <= 2) return { score: 1, label: mergedStrengthLabels.weak, color: 'bg-error' }
    if (score <= 4) return { score: 2, label: mergedStrengthLabels.medium, color: 'bg-warning' }
    if (score <= 5) return { score: 3, label: mergedStrengthLabels.strong, color: 'bg-success' }
    return { score: 4, label: mergedStrengthLabels.veryStrong, color: 'bg-primary' }
  })
  
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled) return
    if (!passwordsMatch) return
    
    const data: RegisterFormData = {
      username,
      email,
      phone,
      password,
      confirmPassword: requireConfirmPassword ? confirmPassword : undefined,
      nickname,
    }
    
    await onsubmit?.(data)
  }
  
  // 获取字段值
  function getFieldValue(field: RegisterField): string {
    switch (field) {
      case 'username': return username
      case 'email': return email
      case 'phone': return phone
      case 'nickname': return nickname
      default: return ''
    }
  }
  
  // 设置字段值
  function setFieldValue(field: RegisterField, value: string) {
    switch (field) {
      case 'username': username = value; break
      case 'email': email = value; break
      case 'phone': phone = value; break
      case 'nickname': nickname = value; break
    }
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
      <!-- 密码字段 -->
      <div class="form-control">
        <label class="label" for="register-password">
          <span class="label-text">{fieldConfigs.password.label}</span>
        </label>
        <div class="relative">
          <input
            id="register-password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder={fieldConfigs.password.placeholder}
            class={cn('input input-bordered w-full pr-10', errors.password && 'input-error')}
            value={password}
            oninput={(e) => { 
              password = e.currentTarget.value
              e.currentTarget.setCustomValidity('')
            }}
            oninvalid={(e) => {
              const input = e.currentTarget as HTMLInputElement
              if (input.validity.valueMissing && validationMessages.required) {
                input.setCustomValidity(validationMessages.required)
              }
            }}
            {disabled}
            required
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
            onclick={() => { showPassword = !showPassword }}
            tabindex={-1}
            aria-label={showPassword ? mergedToggleLabels.hidePassword : mergedToggleLabels.showPassword}
          >
            {#if showPassword}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            {/if}
          </button>
        </div>
        {#if errors.password}
          <div class="label">
            <span class="label-text-alt text-error">{errors.password}</span>
          </div>
        {/if}
        
        <!-- 密码强度指示器 -->
        {#if showPasswordStrength && password}
          <div class="mt-2">
            <div class="flex gap-1 mb-1">
              {#each [1, 2, 3, 4] as level}
                <div
                  class={cn(
                    'h-1 flex-1 rounded-full',
                    level <= passwordStrength.score ? passwordStrength.color : 'bg-base-300'
                  )}
                ></div>
              {/each}
            </div>
            <span class="text-xs text-base-content/60">
              {mergedStrengthLabels.label}：{passwordStrength.label}
            </span>
          </div>
        {/if}
      </div>
      
      <!-- 确认密码字段 -->
      {#if requireConfirmPassword}
        <div class="form-control">
          <label class="label" for="register-confirm-password">
            <span class="label-text">{fieldConfigs.confirmPassword.label}</span>
          </label>
          <div class="relative">
            <input
              id="register-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              placeholder={fieldConfigs.confirmPassword.placeholder}
              class={cn('input input-bordered w-full pr-10', confirmPasswordError && 'input-error')}
              value={confirmPassword}
              oninput={(e) => { 
                confirmPassword = e.currentTarget.value
                e.currentTarget.setCustomValidity('')
              }}
              oninvalid={(e) => {
                const input = e.currentTarget as HTMLInputElement
                if (input.validity.valueMissing && validationMessages.required) {
                  input.setCustomValidity(validationMessages.required)
                }
              }}
              {disabled}
              required
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
              onclick={() => { showConfirmPassword = !showConfirmPassword }}
              tabindex={-1}
              aria-label={showConfirmPassword ? mergedToggleLabels.hidePassword : mergedToggleLabels.showPassword}
            >
              {#if showConfirmPassword}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              {/if}
            </button>
          </div>
          {#if confirmPasswordError}
            <div class="label">
              <span class="label-text-alt text-error">{confirmPasswordError}</span>
            </div>
          {/if}
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
            value={getFieldValue(field)}
            oninput={(e) => {
              setFieldValue(field, e.currentTarget.value)
              e.currentTarget.setCustomValidity('')
            }}
            oninvalid={(e) => handleInvalid(e, field)}
            {disabled}
            required={field === 'username' || field === 'email'}
          />
          {#if errors[field]}
            <div class="label">
              <span class="label-text-alt text-error">{errors[field]}</span>
            </div>
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
