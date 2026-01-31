<!--
  @component Toast
  全局通知组件，在页面右上角显示通知消息。
  支持四种通知类型：success（成功）、error（错误）、warning（警告）、info（信息）。

  @prop {ToastMessage[]} messages - 通知消息数组
  @prop {function} ondismiss - 关闭通知的回调

  @example
  <Toast 
    messages={notifications} 
    ondismiss={(id) => notifications = notifications.filter(n => n.id !== id)} 
  />
-->
<script lang='ts'>
  interface ToastMessage {
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
  }

  interface Props {
    messages?: ToastMessage[]
    /** 关闭按钮的 aria-label */
    closeLabel?: string
    ondismiss?: (id: string) => void
    class?: string
  }

  let { 
    messages = [], 
    closeLabel = 'Close notification',
    ondismiss, 
    class: className = '' 
  }: Props = $props()

  /** 通知类型样式映射 */
  const typeStyles: Record<string, { bg: string, icon: string }> = {
    success: { bg: 'alert-success', icon: 'icon-[tabler--check]' },
    error: { bg: 'alert-error', icon: 'icon-[tabler--x]' },
    warning: { bg: 'alert-warning', icon: 'icon-[tabler--alert-triangle]' },
    info: { bg: 'alert-info', icon: 'icon-[tabler--info-circle]' },
  }
</script>

{#if messages.length > 0}
  <div class='fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm {className}'>
    {#each messages as notification (notification.id)}
      <div class='alert {typeStyles[notification.type].bg} shadow-lg animate-in slide-in-from-right'>
        <span class='{typeStyles[notification.type].icon} size-5'></span>
        <span class='flex-1'>{notification.message}</span>
        {#if ondismiss}
          <button
            type='button'
            class='btn btn-ghost btn-xs btn-circle'
            onclick={() => ondismiss?.(notification.id)}
            aria-label={closeLabel}
          >
            <span class='icon-[tabler--x] size-4'></span>
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}
