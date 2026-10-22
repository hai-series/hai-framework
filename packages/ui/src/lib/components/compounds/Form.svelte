<!--
  @component Form
  =============================================================================
  @h-ai/ui - Form 组件
  =============================================================================
  表单容器组件，提供统一的表单提交、验证和重置功能

  使用 Svelte 5 Runes ($props, $state)
  =============================================================================

  @example
  ```ts
  import { mount, unmount, createRawSnippet } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Form } from '@h-ai/ui'
  const props: ComponentProps<typeof Form> = { id: 'profile-form', columns: 2, children: createRawSnippet(() => ({ render: () => "<input name=\"email\" type=\"email\" value=\"ada@example.com\" />" })) }
  const component = mount(Form, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, FormProps } from '../../types.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import FormLayout from './FormLayout.svelte'

  const {
    id = '',
    class: className = '',
    loading = false,
    disabled = false,
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    onsubmit,
    onreset,
    onerror,
    children,
    ...restProps
  }: FormProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
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

  function handleReset() {
    onreset?.()
  }

  /**
   * 重置表单
   * @returns 无返回值；调用原生 form.reset()。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { Form } from '@h-ai/ui'
   * const form = mount(Form, { target: document.body, props: { id: 'profile' } })
   * form.reset()
   * await unmount(form)
   * ```
   */
  export function reset() {
    formElement?.reset()
  }

  /**
   * 获取表单数据
   * @returns 当前 form 的字段值记录。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { Form } from '@h-ai/ui'
   * const form = mount(Form, { target: document.body, props: { id: 'profile' } })
   * const data = form.getData()
   * await unmount(form)
   * ```
   */
  export function getData(): Record<string, unknown> {
    const formData = new FormData(formElement)
    const data: Record<string, unknown> = {}
    for (const [key, value] of formData.entries()) {
      data[key] = value
    }
    return data
  }
</script>

<form {...dataAttributes}
      bind:this={formElement}
      id={id || undefined}
      class={formClass}
      onsubmit={handleSubmit}
      onreset={handleReset}
>
  <FormLayout {columns} {labelPosition} {labelWidth}>
    {#if children}
      {@render children()}
    {/if}
  </FormLayout>
</form>
