<!--
  =============================================================================
  @hai/ui - PasswordInput 组件
  =============================================================================
  密码输入框组件，支持显示/隐藏切换和密码强度指示
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  图标内嵌在输入框右侧，带分隔线
  支持自定义验证消息（validationMessage）实现 i18n
  =============================================================================
-->
<script lang="ts">
  import type { PasswordInputProps } from '../types.js'
  import { cn, getInputSizeClass } from '../../../utils.js'
  
  const defaultLabels = {
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    strengthLabel: 'Password strength:',
    strengthWeak: 'Weak',
    strengthFair: 'Fair',
    strengthGood: 'Good',
    strengthStrong: 'Strong',
  }
  
  let {
    value = $bindable(''),
    placeholder = 'Enter password',
    size = 'md',
    disabled = false,
    readonly = false,
    required = false,
    error = '',
    showToggle = true,
    showStrength = false,
    minLength = 8,
    labels = {},
    class: className = '',
    inputRef = $bindable<HTMLInputElement | undefined>(),
    oninput,
    onchange,
    oninvalid,
  }: PasswordInputProps & {
    inputRef?: HTMLInputElement
    oninvalid?: (e: Event & { currentTarget: HTMLInputElement }) => void
  } = $props()
  
  const mergedLabels = $derived({ ...defaultLabels, ...labels })
  
  let showPassword = $state(false)
  
  // 容器高度
  const containerHeight = $derived(
    size === 'xs' ? 'h-8' :
    size === 'sm' ? 'h-10' :
    size === 'lg' ? 'h-14' :
    'h-12'
  )
  
  // 图标大小
  const iconSize = $derived(
    size === 'xs' ? 'w-4 h-4' :
    size === 'sm' ? 'w-4 h-4' :
    size === 'lg' ? 'w-6 h-6' :
    'w-5 h-5'
  )
  
  // 计算密码强度
  const strength = $derived.by(() => {
    if (!value) return { score: 0, label: '', color: '' }
    
    let score = 0
    
    // 长度检查
    if (value.length >= minLength) score += 1
    if (value.length >= 12) score += 1
    
    // 复杂度检查
    if (/[a-z]/.test(value)) score += 1
    if (/[A-Z]/.test(value)) score += 1
    if (/[0-9]/.test(value)) score += 1
    if (/[^a-zA-Z0-9]/.test(value)) score += 1
    
    // 返回强度等级
    if (score <= 2) return { score: 1, label: mergedLabels.strengthWeak, color: 'bg-error' }
    if (score <= 4) return { score: 2, label: mergedLabels.strengthFair, color: 'bg-warning' }
    if (score <= 5) return { score: 3, label: mergedLabels.strengthGood, color: 'bg-success' }
    return { score: 4, label: mergedLabels.strengthStrong, color: 'bg-primary' }
  })
  
  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    value = e.currentTarget.value
    oninput?.(e)
  }
  
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    onchange?.(e)
  }
  
  function togglePassword() {
    showPassword = !showPassword
  }
</script>

<div class="form-control w-full">
  <!-- 输入框容器，模拟 input 边框 -->
  <div class={cn(
    'flex items-center w-full rounded-box border bg-base-100',
    containerHeight,
    error ? 'border-error' : 'border-base-content/20',
    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-base-content/20',
    className
  )}>
    <input
      bind:this={inputRef}
      type={showPassword ? 'text' : 'password'}
      {placeholder}
      {disabled}
      {readonly}
      {required}
      class="flex-1 h-full px-4 bg-transparent border-none outline-none"
      {value}
      oninput={handleInput}
      onchange={handleChange}
      oninvalid={oninvalid}
    />
    
    {#if showToggle}
      <!-- 分隔线 -->
      <div class={cn('w-px h-6 bg-base-content/20')}></div>
      
      <!-- 切换按钮 -->
      <button
        type="button"
        class="flex items-center justify-center w-12 h-full text-base-content/50 hover:text-base-content transition-colors"
        onclick={togglePassword}
        tabindex="-1"
        {disabled}
        aria-label={showPassword ? mergedLabels.hidePassword : mergedLabels.showPassword}
      >
        {#if showPassword}
          <!-- 眼睛斜杠图标 - 隐藏密码 -->
          <svg xmlns="http://www.w3.org/2000/svg" class={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        {:else}
          <!-- 眼睛图标 - 显示密码 -->
          <svg xmlns="http://www.w3.org/2000/svg" class={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        {/if}
      </button>
    {/if}
  </div>
  
  {#if showStrength && value}
    <div class="mt-2">
      <div class="flex gap-1 mb-1">
        {#each [1, 2, 3, 4] as level}
          <div
            class={cn(
              'h-1 flex-1 rounded-full',
              level <= strength.score ? strength.color : 'bg-base-300'
            )}
          ></div>
        {/each}
      </div>
      <span class="text-xs text-base-content/60">
        {mergedLabels.strengthLabel} {strength.label}
      </span>
    </div>
  {/if}
  
  {#if error}
    <div class="label">
      <span class="label-text-alt text-error">{error}</span>
    </div>
  {/if}
</div>
