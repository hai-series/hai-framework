<!--
  =============================================================================
  @h-ai/ui - PasswordInput 组件
  =============================================================================
  密码输入框组件，支持显示/隐藏切换和密码强度指示
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  图标内嵌在输入框右侧，带分隔线
  内置多语言支持，自动跟随全局 locale
  =============================================================================
-->
<script lang="ts">
  import type { Size } from '../../../types.js'
  import { cn } from '../../../utils.js'
  import Progress from '../../primitives/Progress.svelte'
  import BareInput from '../../primitives/BareInput.svelte'
  import BareButton from '../../primitives/BareButton.svelte'
  import { m } from '../../../messages.js'
  
  interface Props {
    /** 元素 ID */
    id?: string
    /** 值 */
    value?: string
    /** 占位符 */
    placeholder?: string
    /** 尺寸 */
    size?: Size
    /** 是否禁用 */
    disabled?: boolean
    /** 是否只读 */
    readonly?: boolean
    /** 是否必填 */
    required?: boolean
    /** 错误消息 */
    error?: string
    /** 是否显示切换按钮 */
    showToggle?: boolean
    /** 是否显示密码强度 */
    showStrength?: boolean
    /** 最小长度 */
    minLength?: number
    /** 自定义类名 */
    class?: string
    /** 输入框引用 */
    inputRef?: HTMLInputElement
    /** 输入事件 */
    oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
    /** 变化事件 */
    onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
    /** 无效事件 */
    oninvalid?: (e: Event & { currentTarget: HTMLInputElement }) => void
  }
  
  let {
    id,
    value = $bindable(''),
    placeholder = '',
    size = 'md',
    disabled = false,
    readonly = false,
    required = false,
    error = '',
    showToggle = true,
    showStrength = false,
    minLength = 8,
    class: className = '',
    inputRef = $bindable<HTMLInputElement | undefined>(),
    oninput,
    onchange,
    oninvalid,
  }: Props = $props()
  
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
    if (score <= 2) return { score: 1, label: m('password_strength_weak'), color: 'bg-error' }
    if (score <= 4) return { score: 2, label: m('password_strength_fair'), color: 'bg-warning' }
    if (score <= 5) return { score: 3, label: m('password_strength_good'), color: 'bg-success' }
    return { score: 4, label: m('password_strength_strong'), color: 'bg-primary' }
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
    <BareInput
      type={showPassword ? 'text' : 'password'}
      {id}
      class="flex-1 h-full px-4 bg-transparent border-none outline-none"
      bind:value
      bind:inputRef={inputRef}
      {placeholder}
      {disabled}
      {readonly}
      {required}
      oninput={handleInput}
      onchange={handleChange}
      oninvalid={oninvalid}
    />
    
    {#if showToggle}
      <!-- 分隔线 -->
      <div class={cn('w-px h-6 bg-base-content/20')}></div>
      
      <!-- 切换按钮 -->
      <BareButton
        type="button"
        class="flex items-center justify-center w-10 h-full text-base-content/50 hover:text-base-content transition-colors"
        onclick={togglePassword}
        tabindex={-1}
        {disabled}
        ariaLabel={showPassword ? m('password_hide') : m('password_show')}
      >
        {#if showPassword}
          <!-- 眼睛斜杠图标 - 隐藏密码 -->
          <svg xmlns="http://www.w3.org/2000/svg" class={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        {:else}
          <!-- 眼睛图标 - 显示密码 -->
          <svg xmlns="http://www.w3.org/2000/svg" class={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        {/if}
      </BareButton>
    {/if}
  </div>
  
  {#if showStrength && value}
    <div class="mt-2">
      <Progress 
        value={strength.score} 
        max={4} 
        size="xs" 
        variant={strength.score <= 1 ? 'error' : strength.score <= 2 ? 'warning' : strength.score <= 3 ? 'success' : 'primary'}
      />
      <span class="text-xs text-base-content/60 mt-1 block">
        {m('password_strength_label')} {strength.label}
      </span>
    </div>
  {/if}
  
  {#if error}
    <div class="label">
      <span class="label-text-alt text-error">{error}</span>
    </div>
  {/if}
</div>
