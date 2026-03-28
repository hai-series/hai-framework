<!--
  @component Alert
  警告框组件，使用 tabler icon 替代 emoji，更精致。
-->
<script lang='ts'>
  import type { AlertProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getAlertVariantClass } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'

  const {
    variant = 'info',
    title = '',
    dismissible = false,
    class: className = '',
    onclose,
    children,
  }: AlertProps = $props()

  let visible = $state(true)

  const alertClass = $derived(
    cn(
      'alert',
      getAlertVariantClass(variant),
      className,
    ),
  )

  // 图标映射：使用 tabler icon 类
  const iconMap: Record<string, string> = {
    info: 'icon-[tabler--info-circle]',
    success: 'icon-[tabler--circle-check]',
    warning: 'icon-[tabler--alert-triangle]',
    error: 'icon-[tabler--circle-x]',
  }

  function handleClose() {
    visible = false
    onclose?.()
  }
</script>

{#if visible}
  <div class={alertClass} role='alert'>
    <span class='{iconMap[variant] ?? iconMap.info} size-5 shrink-0'></span>

    <div>
      {#if title}
        <h3 class='font-semibold text-sm'>{title}</h3>
      {/if}
      {#if children}
        <div class='text-sm'>
          {@render children()}
        </div>
      {/if}
    </div>

    {#if dismissible}
      <IconButton size='sm' variant='ghost' label={uiM('common_close')} onclick={handleClose}>
        {#snippet children()}
          <span class='icon-[tabler--x] size-4'></span>
        {/snippet}
      </IconButton>
    {/if}
  </div>
{/if}
