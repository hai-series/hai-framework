<!--
  =============================================================================
  @h-ai/ui - Form 组件
  =============================================================================
  表单容器组件，提供统一的表单提交、验证和重置功能

  使用 Svelte 5 Runes ($props, $state)
  =============================================================================
-->
<script lang='ts'>
  import type { FormProps } from '../../types.js'
  import { cn } from '../../utils.js'

  const {
    class: className = '',
    loading = false,
    disabled = false,
    onsubmit,
    onreset,
    onerror,
    children,
  }: FormProps = $props()

  let formElement: HTMLFormElement

  const formClass = $derived(
    cn(
      'form',
      loading && 'opacity-70 pointer-events-none',
      className,
    ),
  )

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (loading || disabled)
      return

    try {
      const formData = new FormData(formElement)
      const data: Record<string, unknown> = {}

      for (const [key, value] of formData.entries()) {
        // 处理多值字段（如 checkbox 组）
        if (data[key] !== undefined) {
          if (Array.isArray(data[key])) {
            (data[key] as unknown[]).push(value)
          }
          else {
            data[key] = [data[key], value]
          }
        }
        else {
          data[key] = value
        }
      }

      await onsubmit?.(data)
    }
    catch (error) {
      onerror?.(error)
    }
  }

  function handleReset(e: Event) {
    e.preventDefault()
    formElement?.reset()
    onreset?.()
  }

  /** 重置表单 */
  export function reset() {
    formElement?.reset()
  }

  /** 获取表单数据 */
  export function getData(): Record<string, unknown> {
    const formData = new FormData(formElement)
    const data: Record<string, unknown> = {}
    for (const [key, value] of formData.entries()) {
      data[key] = value
    }
    return data
  }
</script>

<form
  bind:this={formElement}
  class={formClass}
  onsubmit={handleSubmit}
  onreset={handleReset}
>
  {#if children}
    {@render children()}
  {/if}
</form>
