<!--
  @component Alert
  警告框组件，使用 tabler icon 替代 emoji，更精致。

  @example
  ```ts
  import { mount, unmount, createRawSnippet } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Alert } from '@h-ai/ui'
  const props: ComponentProps<typeof Alert> = { title: '保存成功', variant: 'success', children: createRawSnippet(() => ({ render: () => "<span>操作已经完成。</span>" })) }
  const component = mount(Alert, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { AlertProps, DataAttributes } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getAlertVariantClass, getDataAttributes } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'

  const {
    variant = 'info',
    title = '',
    dismissible = false,
    class: className = '',
    onclose,
    children,
    ...restProps
  }: AlertProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let visible = $state(true)

  const alertClass = $derived(
    cn(
      'alert',
      'flex items-start gap-3',
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
  <div {...dataAttributes} class={alertClass} role='alert'>
    <span class='{iconMap[variant] ?? iconMap.info} mt-0.5 size-5 shrink-0' aria-hidden='true'></span>

    <div class='min-w-0 flex-1 [overflow-wrap:anywhere]'>
      {#if title}
        <h3 class='font-semibold text-sm'>{title}</h3>
      {/if}
      {#if children}
        <div class='text-sm leading-relaxed'>
          {@render children()}
        </div>
      {/if}
    </div>

    {#if dismissible}
      <IconButton size='sm' variant='ghost' class='shrink-0' label={uiM('common_close')} onclick={handleClose}>
        <span class='icon-[tabler--x] size-4'></span>
      </IconButton>
    {/if}
  </div>
{/if}
