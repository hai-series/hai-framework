<!--
  =============================================================================
  @hai/ui - SignatureDisplay 组件
  =============================================================================
  签名信息展示组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { SignatureDisplayProps } from '../types.js'
  import { cn } from '../../../utils.js'
  
  let {
    signature = '',
    publicKey = '',
    algorithm = 'SM2',
    verified = undefined,
    showPublicKey = false,
    copyable = true,
    class: className = '',
  }: SignatureDisplayProps = $props()
  
  let copiedSig = $state(false)
  let copiedKey = $state(false)
  
  const containerClass = $derived(
    cn(
      'signature-display space-y-3',
      className,
    )
  )
  
  const verifyStatusText = $derived(
    verified === true
      ? '验证通过'
      : verified === false
        ? '验证失败'
        : '未验证'
  )
  
  async function copySignature() {
    if (!signature) return
    try {
      await navigator.clipboard.writeText(signature)
      copiedSig = true
      setTimeout(() => { copiedSig = false }, 2000)
    } catch {
      // 复制失败
    }
  }
  
  async function copyPublicKey() {
    if (!publicKey) return
    try {
      await navigator.clipboard.writeText(publicKey)
      copiedKey = true
      setTimeout(() => { copiedKey = false }, 2000)
    } catch {
      // 复制失败
    }
  }
</script>

<div class={containerClass}>
  <!-- 签名状态 -->
  <div class="flex items-center gap-2">
    <span class="text-sm font-medium">签名 ({algorithm})</span>
    {#if verified !== undefined}
      <span class={cn('badge badge-sm', verified ? 'badge-success' : 'badge-error')}>
        {#if verified}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        {/if}
        {verifyStatusText}
      </span>
    {/if}
  </div>
  
  <!-- 签名值 -->
  <div class="bg-base-200 rounded-lg p-3">
    <div class="flex items-start justify-between gap-2">
      <code class="text-xs font-mono break-all text-base-content/80 flex-1">
        {signature || '无签名'}
      </code>
      {#if copyable && signature}
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-circle shrink-0"
          onclick={copySignature}
          aria-label="复制签名"
        >
          {#if copiedSig}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          {/if}
        </button>
      {/if}
    </div>
  </div>
  
  <!-- 公钥（可选） -->
  {#if showPublicKey && publicKey}
    <div>
      <div class="text-xs text-base-content/60 mb-1">公钥</div>
      <div class="bg-base-200 rounded-lg p-3">
        <div class="flex items-start justify-between gap-2">
          <code class="text-xs font-mono break-all text-base-content/80 flex-1">
            {publicKey}
          </code>
          {#if copyable}
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-circle shrink-0"
              onclick={copyPublicKey}
              aria-label="复制公钥"
            >
              {#if copiedKey}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
