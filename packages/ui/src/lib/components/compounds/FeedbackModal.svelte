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
  import Button from '../primitives/Button.svelte'
  import Modal from './Modal.svelte'
  import Input from '../primitives/Input.svelte'
  import Textarea from '../primitives/Textarea.svelte'

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
  
  // 默认文案
  const defaultLabels: Required<FeedbackLabels> = {
    title: 'Feedback',
    description: 'We value your feedback. Please share your thoughts with us.',
    typeLabel: 'Feedback Type',
    contentLabel: 'Content',
    contentPlaceholder: 'Please describe your issue or suggestion in detail...',
    contactLabel: 'Contact (Optional)',
    contactPlaceholder: 'Email or phone for us to reply',
    cancel: 'Cancel',
    submit: 'Submit Feedback',
    errorEmpty: 'Please fill in the feedback content',
    errorSubmit: 'Submission failed, please try again',
    types: {
      bug: 'Bug Report',
      feature: 'Feature Request',
      question: 'Question',
      other: 'Other',
    },
  }

  interface Props {
    open?: boolean
    labels?: FeedbackLabels
    onsubmit?: (data: FeedbackData) => Promise<void>
  }

  let { open = $bindable(false), labels = {}, onsubmit }: Props = $props()
  
  // 合并文案
  const mergedLabels = $derived({
    ...defaultLabels,
    ...labels,
    types: { ...defaultLabels.types, ...labels.types },
  })

  let feedbackType = $state<FeedbackType>('bug')
  let description = $state('')
  let contact = $state('')
  let loading = $state(false)
  let error = $state('')

  const typeOptions = $derived<{ value: FeedbackType, label: string }[]>([
    { value: 'bug', label: mergedLabels.types.bug },
    { value: 'feature', label: mergedLabels.types.feature },
    { value: 'question', label: mergedLabels.types.question },
    { value: 'other', label: mergedLabels.types.other },
  ])

  async function handleSubmit() {
    if (!description.trim()) {
      error = mergedLabels.errorEmpty
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
      error = e instanceof Error ? e.message : mergedLabels.errorSubmit
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

<Modal bind:open title={mergedLabels.title}>
  <p class='text-base-content/70 mb-4'>{mergedLabels.description}</p>

  {#if error}
    <div class='alert alert-error mb-4'>
      <span class='icon-[tabler--alert-circle] size-5'></span>
      <span>{error}</span>
    </div>
  {/if}

  <div class='space-y-4'>
    <div class='form-control'>
      <label class='label' for='feedback-type'>
        <span class='label-text'>{mergedLabels.typeLabel}</span>
      </label>
      <select
        id='feedback-type'
        class='select select-bordered w-full'
        bind:value={feedbackType}
      >
        {#each typeOptions as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <div class='form-control'>
      <label class='label' for='feedback-desc'>
        <span class='label-text'>{mergedLabels.contentLabel} <span class='text-error'>*</span></span>
      </label>
      <Textarea
        id='feedback-desc'
        class='h-32'
        placeholder={mergedLabels.contentPlaceholder}
        bind:value={description}
      />
    </div>

    <div class='form-control'>
      <label class='label' for='feedback-contact'>
        <span class='label-text'>{mergedLabels.contactLabel}</span>
      </label>
      <Input
        id='feedback-contact'
        type='text'
        class='w-full'
        placeholder={mergedLabels.contactPlaceholder}
        bind:value={contact}
        autocomplete='email'
      />
    </div>
  </div>

  {#snippet footer()}
    <button class='btn btn-ghost' type='button' onclick={() => open = false}>
      {mergedLabels.cancel}
    </button>
    <Button variant='primary' {loading} onclick={handleSubmit}>
      {mergedLabels.submit}
    </Button>
  {/snippet}
</Modal>
