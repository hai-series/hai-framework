<!--
  @component FeedbackModal
  用户反馈模态框，支持 Bug 报告、功能建议等多种反馈类型。

  @prop {boolean} open - 是否显示模态框（双向绑定）
  @prop {function} onsubmit - 提交反馈的回调

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { FeedbackModal } from '@h-ai/ui'
  const props: ComponentProps<typeof FeedbackModal> = { open: true, labels: { title: '提交反馈' } }
  const component = mount(FeedbackModal, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'
  import Select from '../../primitives/Select.svelte'
  import Textarea from '../../primitives/Textarea.svelte'

  /**
   * 反馈表单可选的问题类别。
   *
   * @example 模块内部上下文
   * ```ts
   * const example: FeedbackType = 'bug'
   * ```
   */
  type FeedbackType = 'bug' | 'feature' | 'question' | 'other'

  /**
   * 反馈表单提交值；描述和联系方式由宿主验证并保存。
   *
   * @example 模块内部上下文
   * ```ts
   * const example: FeedbackData = { type: 'bug', description: '保存后列表没有刷新', contact: 'ada@example.com' }
   * ```
   */
  interface FeedbackData {
    type: FeedbackType
    description: string
    contact?: string
  }

  /**
   * i18n 文案配置
   *
   * @example 模块内部上下文
   * ```ts
   * const example: FeedbackLabels = { title: '提交反馈', contentLabel: '问题描述' }
   * ```
   */
  interface FeedbackLabels {
    title?: string
    description?: string
    typeLabel?: string
    contentLabel?: string
    contentPlaceholder?: string
    contactLabel?: string
    contactPlaceholder?: string
    cancel?: string
    submit?: string
    errorEmpty?: string
    errorSubmit?: string
    types?: {
      bug?: string
      feature?: string
      question?: string
      other?: string
    }
  }

  import type { DataAttributes, FormLayoutOptions } from '../../../types.js'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'

  /**
   * FeedbackModal 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import type { ComponentProps } from 'svelte'
   * import { FeedbackModal } from '@h-ai/ui'
   * const props: ComponentProps<typeof FeedbackModal> = { open: true, labels: { title: '提交反馈' } }
   * const component = mount(FeedbackModal, { target: document.body, props })
   * await unmount(component)
   * ```
   */
  interface Props extends FormLayoutOptions {
    open?: boolean
    labels?: FeedbackLabels
    onsubmit?: (data: FeedbackData) => Promise<void>
    class?: string
  }

  let { open = $bindable(false), labels = {}, columns = 1, labelPosition = 'top', labelWidth = '8rem', onsubmit, class: className = '', ...restProps }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  // 文案优先使用传入的 labels，缺省回退到内置消息 uiM(...)

  let feedbackType = $state<FeedbackType>('bug')
  let description = $state('')
  let contact = $state('')
  let loading = $state(false)
  let error = $state<'empty' | 'submit' | ''>('')
  let submitError = $state('')
  const errorText = $derived(error === 'empty' ? labels.errorEmpty ?? uiM('feedback_error_empty') : error === 'submit' ? submitError || labels.errorSubmit || uiM('feedback_error_submit') : '')

  const typeOptions = $derived([
    { value: 'bug', label: labels.types?.bug ?? uiM('feedback_type_bug') },
    { value: 'feature', label: labels.types?.feature ?? uiM('feedback_type_feature') },
    { value: 'question', label: labels.types?.question ?? uiM('feedback_type_question') },
    { value: 'other', label: labels.types?.other ?? uiM('feedback_type_other') },
  ])

  async function handleSubmit() {
    if (loading)
      return
    if (!description.trim()) {
      error = 'empty'
      return
    }

    loading = true
    error = ''

    try {
      await onsubmit?.({
        type: feedbackType,
        description: description.trim(),
        contact: contact.trim() || undefined,
      })
      open = false
      resetForm()
    }
    catch (e) {
      submitError = e instanceof Error ? e.message : ''
      error = 'submit'
    }
    finally {
      loading = false
    }
  }

  function resetForm() {
    feedbackType = 'bug'
    description = ''
    contact = ''
    error = ''
    submitError = ''
  }
</script>

<Modal {...dataAttributes} class={className} bind:open title={labels.title ?? uiM('feedback_title')}>
  <p class='text-base-content/70 mb-4'>{labels.description ?? uiM('feedback_description')}</p>

  {#if error === 'submit'}
    <div class='alert alert-error mb-4'>
      <span class='icon-[tabler--alert-circle] size-5'></span>
      <span>{errorText}</span>
    </div>
  {/if}

  <FormLayout {columns} {labelPosition} {labelWidth}>
    <FormField for='feedback-type' label={labels.typeLabel ?? uiM('feedback_type_label')}>
      <Select
        id='feedback-type'
        options={typeOptions}
        bind:value={feedbackType}
      />
    </FormField>

    <FormField for='feedback-desc' label={labels.contentLabel ?? uiM('feedback_content_label')} required error={error === 'empty' ? errorText : ''}>
      <Textarea
        id='feedback-desc'
        class='h-32'
        placeholder={labels.contentPlaceholder ?? uiM('feedback_content_placeholder')}
        bind:value={description}
        disabled={loading}
        oninput={() => {
          if (description.trim())
            error = ''
        }}
      />
    </FormField>

    <FormField for='feedback-contact' label={labels.contactLabel ?? uiM('feedback_contact_label')}>
      <Input
        id='feedback-contact'
        type='text'
        class='w-full'
        placeholder={labels.contactPlaceholder ?? uiM('feedback_contact_placeholder')}
        bind:value={contact}
        autocomplete='email'
      />
    </FormField>
  </FormLayout>

  {#snippet footer()}
    <Button variant='ghost' onclick={() => open = false}>
      {labels.cancel ?? uiM('feedback_cancel')}
    </Button>
    <Button variant='primary' {loading} onclick={handleSubmit}>
      {labels.submit ?? uiM('feedback_submit')}
    </Button>
  {/snippet}
</Modal>
