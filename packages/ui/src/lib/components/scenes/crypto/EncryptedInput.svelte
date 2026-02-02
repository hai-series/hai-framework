<!--
  =============================================================================
  @hai/ui - EncryptedInput 组件
  =============================================================================
  加密输入框组件，支持自动加密显示
  
  使用 Svelte 5 Runes ($props, $state, $derived, $bindable)
  内置多语言支持，自动跟随全局 locale
  =============================================================================
-->
<script lang="ts">
  import type { Size } from '../../../types.js'
  import Input from '../../primitives/Input.svelte'
  import IconButton from '../../primitives/IconButton.svelte'
  import BareButton from '../../primitives/BareButton.svelte'
  import { m } from '../../../messages.js'
  
  interface Props {
    /** 原始值 */
    value?: string
    /** 加密后的值 */
    encryptedValue?: string
    /** 占位符 */
    placeholder?: string
    /** 尺寸 */
    size?: Size
    /** 是否禁用 */
    disabled?: boolean
    /** 是否显示加密结果 */
    showEncrypted?: boolean
    /** 加密算法 */
    algorithm?: string
    /** 自定义类名 */
    class?: string
    /** 加密函数 */
    onencrypt?: (value: string) => Promise<string>
    /** 输入事件 */
    oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void
    /** 变化事件 */
    onchange?: (e: Event & { currentTarget: HTMLInputElement }) => void
  }
  
  let {
    value = $bindable(''),
    encryptedValue = $bindable(''),
    placeholder,
    size = 'md',
    disabled = false,
    showEncrypted = false,
    algorithm = 'SM4',
    class: className = '',
    onencrypt,
    oninput,
    onchange,
  }: Props = $props()
  
  let showValue = $state(false)
  
  // 模拟加密（实际应该调用 crypto 服务）
  function encrypt(text: string): string {
    return btoa(text)
  }
  
  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    value = e.currentTarget.value
    
    if (value && onencrypt) {
      onencrypt(value).then(encrypted => {
        encryptedValue = encrypted
      })
    } else if (value) {
      encryptedValue = encrypt(value)
    } else {
      encryptedValue = ''
    }
    
    oninput?.(e)
  }
  
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    onchange?.(e)
  }
  
  function toggleShow() {
    showValue = !showValue
  }
  
  function copyEncrypted() {
    if (encryptedValue) {
      navigator.clipboard.writeText(encryptedValue)
    }
  }
</script>

<div class="encrypted-input space-y-2 {className}">
  <!-- 输入框 -->
  <div class="relative">
    <Input
      type={showValue ? 'text' : 'password'}
      placeholder={placeholder || m('encrypted_input_placeholder')}
      {disabled}
      {size}
      bind:value
      oninput={handleInput}
      onchange={handleChange}
      class="pr-10"
    />
    
    <BareButton
      type="button"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
      onclick={toggleShow}
      tabindex={-1}
      ariaLabel={showValue ? m('encrypted_input_hide') : m('encrypted_input_show')}
    >
      {#if showValue}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      {/if}
    </BareButton>
  </div>
  
  <!-- 加密结果展示 -->
  {#if showEncrypted && encryptedValue}
    <div class="bg-base-200 rounded-lg p-3">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-base-content/60">
          {m('encrypted_input_result')} ({algorithm})
        </span>
        <IconButton
          size="xs"
          variant="ghost"
          label={m('encrypted_input_copy')}
          onclick={copyEncrypted}
        >
          {#snippet children()}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          {/snippet}
        </IconButton>
      </div>
      <code class="text-xs break-all text-base-content/80">
        {encryptedValue}
      </code>
    </div>
  {/if}
</div>
