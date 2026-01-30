<!--
  =============================================================================
  @hai/ui - ToastContainer 组件
  =============================================================================
  Toast 容器组件，显示所有 Toast 通知
  
  使用 Svelte 5 Runes ($derived)
  =============================================================================
-->
<script lang="ts">
  import { toast } from '../../toast.svelte.js'
  import { cn, getAlertVariantClass } from '../../utils.js'
  
  const positionMap = {
    'top-right': 'toast-top toast-end',
    'top-left': 'toast-top toast-start',
    'bottom-right': 'toast-bottom toast-end',
    'bottom-left': 'toast-bottom toast-start',
    'top-center': 'toast-top toast-center',
    'bottom-center': 'toast-bottom toast-center',
  }
  
  // 按位置分组
  const groupedItems = $derived(() => {
    const groups: Record<string, typeof toast.items> = {}
    
    for (const item of toast.items) {
      const position = item.position ?? 'top-right'
      if (!groups[position]) {
        groups[position] = []
      }
      groups[position].push(item)
    }
    
    return groups
  })
</script>

{#each Object.entries(groupedItems()) as [position, items]}
  <div class={cn('toast z-50', positionMap[position as keyof typeof positionMap])}>
    {#each items as item (item.id)}
      <div class={cn('alert', getAlertVariantClass(item.variant ?? 'info'))}>
        <span>{item.message}</span>
        {#if item.dismissible}
          <button
            class="btn btn-sm btn-ghost"
            onclick={() => toast.remove(item.id)}
          >
            ✕
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/each}
