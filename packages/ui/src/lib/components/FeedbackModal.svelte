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
  import Button from './Button.svelte'
  import Modal from './Modal.svelte'

  type FeedbackType = 'bug' | 'feature' | 'question' | 'other'

  interface FeedbackData {
    type: FeedbackType
    description: string
    contact?: string
  }

  interface Props {
    open?: boolean
    onsubmit?: (data: FeedbackData) => Promise<void>
  }

  let { open = $bindable(false), onsubmit }: Props = $props()

  let feedbackType = $state<FeedbackType>('bug')
  let description = $state('')
  let contact = $state('')
  let loading = $state(false)
  let error = $state('')

  const typeOptions: { value: FeedbackType, label: string }[] = [
    { value: 'bug', label: 'Bug 报告' },
    { value: 'feature', label: '功能建议' },
    { value: 'question', label: '使用问题' },
    { value: 'other', label: '其他' },
  ]

  async function handleSubmit() {
    if (!description.trim()) {
      error = '请填写反馈内容'
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
      error = e instanceof Error ? e.message : '提交失败，请重试'
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

<Modal bind:open title="意见反馈">
  <p class='text-base-content/70 mb-4'>我们非常重视您的反馈，请告诉我们您的想法。</p>

  {#if error}
    <div class='alert alert-error mb-4'>
      <span class='icon-[tabler--alert-circle] size-5'></span>
      <span>{error}</span>
    </div>
  {/if}

  <div class='space-y-4'>
    <div class='form-control'>
      <label class='label' for='feedback-type'>
        <span class='label-text'>反馈类型</span>
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
        <span class='label-text'>反馈内容 <span class='text-error'>*</span></span>
      </label>
      <textarea
        id='feedback-desc'
        class='textarea textarea-bordered w-full h-32'
        placeholder='请详细描述您的问题或建议...'
        bind:value={description}
      ></textarea>
    </div>

    <div class='form-control'>
      <label class='label' for='feedback-contact'>
        <span class='label-text'>联系方式（可选）</span>
      </label>
      <input
        id='feedback-contact'
        type='text'
        class='input input-bordered w-full'
        placeholder='邮箱或手机号，方便我们回复您'
        bind:value={contact}
      />
    </div>
  </div>

  {#snippet footer()}
    <button class='btn btn-ghost' type='button' onclick={() => open = false}>
      取消
    </button>
    <Button variant='primary' {loading} onclick={handleSubmit}>
      提交反馈
    </Button>
  {/snippet}
</Modal>
