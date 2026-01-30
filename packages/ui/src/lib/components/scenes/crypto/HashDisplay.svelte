<!--
  =============================================================================
  @hai/ui - HashDisplay 组件
  =============================================================================
  哈希值展示组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { HashDisplayProps } from '../types.js'
  import { cn } from '../../../utils.js'
  
  let {
    value = '',
    algorithm = 'SM3',
    label = '',
    copyable = true,
    truncate = true,
    truncateLength = 16,
    class: className = '',
  }: HashDisplayProps = $props()
  
  let copied = $state(false)
  
  const containerClass = $derived(
    cn(
      'hash-display',
      className,
    )
  )
  
  const displayValue = $derived(
    truncate && value.length > truncateLength * 2
      ? `${value.slice(0, truncateLength)}...${value.slice(-truncateLength)}`
      : value
  )
  
  async function copyToClipboard() {
    if (!value) return
    
    try {
      await navigator.clipboard.writeText(value)
      copied = true
      setTimeout(() => {
        copied = false
      }, 2000)
    } catch {
      // 复制失败
    }
  }
</script>

<div class={containerClass}>
  {#if label}
    <div class="text-xs text-base-content/60 mb-1">
      {label}
      {#if algorithm}
        <span class="badge badge-xs badge-ghost ml-1">{algorithm}</span>
      {/if}
    </div>
  {/if}
  
  <div class="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-2">
    <code class="flex-1 text-sm font-mono break-all text-base-content/80" title={value}>
      {displayValue || '-'}
    </code>
    
    {#if copyable && value}
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-circle shrink-0"
        onclick={copyToClipboard}
        aria-label="复制哈希值"
      >
        {#if copied}
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
