<!--
  =============================================================================
  @hai/ui - PasswordInput 组件
  =============================================================================
  密码输入框组件，支持显示/隐藏切换和密码强度指示
  
  使用 Svelte 5 Runes ($props, $state, $derived, $bindable)
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
  
  const inputClass = $derived(
    cn(
      'input input-bordered w-full pr-10',
      getInputSizeClass(size),
      error && 'input-error',
      className,
    )
  )
  
  // 计算密码强度
  const strength = $derived(() => {
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
  <div class="relative">
    <input
      type={showPassword ? 'text' : 'password'}
      {placeholder}
      {disabled}
      {readonly}
      {required}
      class={inputClass}
      bind:value
      oninput={handleInput}
      onchange={handleChange}
    />
    
    {#if showToggle}
      <button
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
        onclick={togglePassword}
        tabindex="-1"
        aria-label={showPassword ? '隐藏密码' : '显示密码'}
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
    {/if}
  </div>
  
  {#if showStrength && value}
    <div class="mt-2">
      <div class="flex gap-1 mb-1">
        {#each [1, 2, 3, 4] as level}
          <div
            class={cn(
              'h-1 flex-1 rounded-full',
              level <= strength().score ? strength().color : 'bg-base-300'
            )}
          ></div>
        {/each}
      </div>
      <span class="text-xs text-base-content/60">
        密码强度：{strength().label}
      </span>
    </div>
  {/if}
  
  {#if error}
    <label class="label">
      <span class="label-text-alt text-error">{error}</span>
    </label>
  {/if}
</div>
