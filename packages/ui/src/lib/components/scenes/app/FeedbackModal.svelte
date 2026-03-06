<!--
  @component FeedbackModal
  用户反馈模态框，支持 Bug 报告、功能建议等多种反馈类型。

  @prop {boolean} open - 是否显示模态框（双向绑定）
  @prop {function} onsubmit - 提交反馈的回调

  @example
  <FeedbackModal 
    bind:open={showFeedback} 
    onsubmit={async (data) => { await submitFeedback(data) }} 
  />
-->
<script lang='ts'>
  import Button from '../../primitives/Button.svelte'
  import Modal from '../../compounds/Modal.svelte'
  import Input from '../../primitives/Input.svelte'
  import Select from '../../primitives/Select.svelte'
  import Textarea from '../../primitives/Textarea.svelte'

  type FeedbackType = 'bug' | 'feature' | 'question' | 'other'

  interface FeedbackData {
    type: FeedbackType
    description: string
    contact?: string
  }
  
  /** i18n 文案配置 */
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
  
  import { uiM } from '../../../messages.js'

  interface Props {
    open?: boolean
    labels?: FeedbackLabels
    onsubmit?: (data: FeedbackData) => Promise<void>
  }

  let { open = $bindable(false), labels = {}, onsubmit }: Props = $props()
  
  // 文案优先使用传入的 labels，缺省回退到内置消息 uiM(...)

  let feedbackType = $state<FeedbackType>('bug')
  let description = $state('')
  let contact = $state('')
  let loading = $state(false)
  let error = $state('')

  const typeOptions = $derived([
    { value: 'bug', label: labels.types?.bug ?? uiM('feedback_type_bug') },
    { value: 'feature', label: labels.types?.feature ?? uiM('feedback_type_feature') },
    { value: 'question', label: labels.types?.question ?? uiM('feedback_type_question') },
    { value: 'other', label: labels.types?.other ?? uiM('feedback_type_other') },
  ])

  async function handleSubmit() {
    if (!description.trim()) {
      error = labels.errorEmpty ?? uiM('feedback_error_empty')
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
    } catch (e) {
      error = e instanceof Error ? e.message : (labels.errorSubmit ?? uiM('feedback_error_submit'))
    } finally {
      loading = false
    }
  }

  function resetForm() {
    feedbackType = 'bug'
    description = ''
    contact = ''
    error = ''
  }
</script>

<Modal bind:open title={labels.title ?? uiM('feedback_title')}>
  <p class='text-base-content/70 mb-4'>{labels.description ?? uiM('feedback_description')}</p>

  {#if error}
    <div class='alert alert-error mb-4'>
      <span class='icon-[tabler--alert-circle] size-5'></span>
      <span>{error}</span>
    </div>
  {/if}

  <div class='space-y-4'>
    <div class='fieldset'>
      <legend class='fieldset-legend'>{labels.typeLabel ?? uiM('feedback_type_label')}</legend>
      <Select
        id='feedback-type'
        options={typeOptions}
        bind:value={feedbackType}
      />
    </div>

    <div class='fieldset'>
      <legend class='fieldset-legend'>{labels.contentLabel ?? uiM('feedback_content_label')} <span class='text-error'>*</span></legend>
      <Textarea
        id='feedback-desc'
        class='h-32'
        placeholder={labels.contentPlaceholder ?? uiM('feedback_content_placeholder')}
        bind:value={description}
      />
    </div>

    <div class='fieldset'>
      <legend class='fieldset-legend'>{labels.contactLabel ?? uiM('feedback_contact_label')}</legend>
      <Input
        id='feedback-contact'
        type='text'
        class='w-full'
        placeholder={labels.contactPlaceholder ?? uiM('feedback_contact_placeholder')}
        bind:value={contact}
        autocomplete='email'
      />
    </div>
  </div>

  {#snippet footer()}
    <Button variant='ghost' onclick={() => open = false}>
      {labels.cancel ?? uiM('feedback_cancel')}
    </Button>
    <Button variant='primary' {loading} onclick={handleSubmit}>
      {labels.submit ?? uiM('feedback_submit')}
    </Button>
  {/snippet}
</Modal>
