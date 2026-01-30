<!--
  =============================================================================
  @hai/ui - PasswordInput 组件
  =============================================================================
  密码输入框组件，支持显示/隐藏切换和密码强度指示
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 DaisyUI join 结构实现输入框和按钮的组合
  =============================================================================
-->
<script lang="ts">
  import type { PasswordInputProps } from '../types.js'
  import { cn, getInputSizeClass } from '../../../utils.js'
  
  let {
    value = $bindable(''),
    placeholder = '请输入密码',
    size = 'md',
    disabled = false,
    readonly = false,
    required = false,
    error = '',
    showToggle = true,
    showStrength = false,
    minLength = 8,
    class: className = '',
    oninput,
    onchange,
  }: PasswordInputProps = $props()
  
  let showPassword = $state(false)
  
  // 输入框基础样式
  const inputClass = $derived(
    cn(
      'input input-bordered flex-1',
      getInputSizeClass(size),
      error && 'input-error',
      // 当有切换按钮时，使用 join 布局，移除右侧边框圆角
      showToggle && 'join-item',
      className,
    )
  )
  
  // 按钮大小映射
  const buttonSizeClass = $derived(
    size === 'xs' ? 'btn-xs' :
    size === 'sm' ? 'btn-sm' :
    size === 'lg' ? 'btn-lg' :
    ''
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
    if (score <= 2) return { score: 1, label: '弱', color: 'bg-error' }
    if (score <= 4) return { score: 2, label: '中', color: 'bg-warning' }
    if (score <= 5) return { score: 3, label: '强', color: 'bg-success' }
    return { score: 4, label: '非常强', color: 'bg-primary' }
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
  <!-- 使用 join 组合输入框和按钮 -->
  <div class={cn('flex w-full', showToggle && 'join')}>
    <input
      type={showPassword ? 'text' : 'password'}
      {placeholder}
      {disabled}
      {readonly}
      {required}
      class={inputClass}
      {value}
      oninput={handleInput}
      onchange={handleChange}
    />
    
    {#if showToggle}
      <button
        type="button"
        class={cn(
          'btn join-item',
          buttonSizeClass,
          error ? 'btn-error btn-outline' : 'btn-ghost border border-base-content/20'
        )}
        onclick={togglePassword}
        tabindex="-1"
        {disabled}
        aria-label={showPassword ? '隐藏密码' : '显示密码'}
      >
        {#if showPassword}
          <!-- 眼睛斜杠图标 - 隐藏密码 -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        {:else}
          <!-- 眼睛图标 - 显示密码 -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
        密码强度：{strength.label}
      </span>
    </div>
  {/if}
  
  {#if error}
    <label class="label">
      <span class="label-text-alt text-error">{error}</span>
    </label>
  {/if}
</div>
