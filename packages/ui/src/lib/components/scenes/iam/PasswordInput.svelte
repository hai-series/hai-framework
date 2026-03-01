<!--
  @component PasswordInput
  密码输入框组件，支持显示/隐藏切换和密码强度指示。
  内置多语言支持，自动跟随全局 locale。
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
  
  // 容器高度（与 Input 组件一致）
  const containerHeight = $derived(
    size === 'xs' ? 'h-8' :
    size === 'sm' ? 'h-9' :
    size === 'lg' ? 'h-12' :
    size === 'xl' ? 'h-14' :
    'h-10'
  )
  
  // 图标大小
  const iconSize = $derived(
    size === 'xs' ? 'size-3.5' :
    size === 'sm' ? 'size-3.5' :
    size === 'lg' ? 'size-5' :
    'size-4'
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

<div class="fieldset w-full">
  <!-- 输入框容器 -->
  <div class={cn(
    'flex items-center w-full rounded-lg border bg-base-100',
    containerHeight,
    error
      ? 'border-error/60 focus-within:ring-2 focus-within:ring-error/15'
      : 'border-base-content/15 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
    'transition-[border-color,box-shadow] duration-150',
    disabled && 'opacity-50 cursor-not-allowed',
    className
  )}>
    <BareInput
      type={showPassword ? 'text' : 'password'}
      {id}
      class="flex-1 h-full px-3 bg-transparent border-none outline-none text-sm placeholder:text-base-content/35"
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
      <!-- 切换按钮 -->
      <BareButton
        type="button"
        class="flex items-center justify-center w-9 h-full text-base-content/35 hover:text-base-content/60 transition-colors"
        onclick={togglePassword}
        tabindex={-1}
        {disabled}
        ariaLabel={showPassword ? m('password_hide') : m('password_show')}
      >
        <span class={cn(
          showPassword ? 'icon-[tabler--eye-off]' : 'icon-[tabler--eye]',
          iconSize,
        )}></span>
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
      <span class="text-xs text-base-content/40 mt-1 block">
        {m('password_strength_label')} {strength.label}
      </span>
    </div>
  {/if}
  
  {#if error}
    <p class="mt-1.5 text-xs text-error/80 leading-tight">{error}</p>
  {/if}
</div>
