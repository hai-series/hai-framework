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
  
  import { m } from '../../../messages.js'

  interface Props {
    open?: boolean
    labels?: FeedbackLabels
    onsubmit?: (data: FeedbackData) => Promise<void>
  }

  let { open = $bindable(false), labels = {}, onsubmit }: Props = $props()
  
  // 文案优先使用传入的 labels，缺省回退到内置消息 m(...)

  let feedbackType = $state<FeedbackType>('bug')
  let description = $state('')
  let contact = $state('')
  let loading = $state(false)
  let error = $state('')

  const typeOptions = $derived([
    { value: 'bug', label: labels.types?.bug ?? m('feedback_type_bug') },
    { value: 'feature', label: labels.types?.feature ?? m('feedback_type_feature') },
    { value: 'question', label: labels.types?.question ?? m('feedback_type_question') },
    { value: 'other', label: labels.types?.other ?? m('feedback_type_other') },
  ])

  async function handleSubmit() {
    if (!description.trim()) {
      error = labels.errorEmpty ?? m('feedback_error_empty')
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
      error = e instanceof Error ? e.message : (labels.errorSubmit ?? m('feedback_error_submit'))
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

<Modal bind:open title={labels.title ?? m('feedback_title')}>
  <p class='text-base-content/70 mb-4'>{labels.description ?? m('feedback_description')}</p>

  {#if error}
    <div class='alert alert-error mb-4'>
      <span class='icon-[tabler--alert-circle] size-5'></span>
      <span>{error}</span>
    </div>
  {/if}

  <div class='space-y-4'>
    <div class='form-control'>
      <label class='label' for='feedback-type'>
        <span class='label-text'>{labels.typeLabel ?? m('feedback_type_label')}</span>
      </label>
      <Select
        id='feedback-type'
        options={typeOptions}
        bind:value={feedbackType}
      />
    </div>

    <div class='form-control'>
      <label class='label' for='feedback-desc'>
        <span class='label-text'>{labels.contentLabel ?? m('feedback_content_label')} <span class='text-error'>*</span></span>
      </label>
      <Textarea
        id='feedback-desc'
        class='h-32'
        placeholder={labels.contentPlaceholder ?? m('feedback_content_placeholder')}
        bind:value={description}
      />
    </div>

    <div class='form-control'>
      <label class='label' for='feedback-contact'>
        <span class='label-text'>{labels.contactLabel ?? m('feedback_contact_label')}</span>
      </label>
      <Input
        id='feedback-contact'
        type='text'
        class='w-full'
        placeholder={labels.contactPlaceholder ?? m('feedback_contact_placeholder')}
        bind:value={contact}
        autocomplete='email'
      />
    </div>
  </div>

  {#snippet footer()}
    <Button variant='ghost' onclick={() => open = false}>
      {labels.cancel ?? m('feedback_cancel')}
    </Button>
    <Button variant='primary' {loading} onclick={handleSubmit}>
      {labels.submit ?? m('feedback_submit')}
    </Button>
  {/snippet}
</Modal>
