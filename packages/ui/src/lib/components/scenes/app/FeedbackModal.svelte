<!-- @component FeedbackModal 提交反馈弹窗。 -->
<script lang='ts'>
  import type { FeedbackSubmitAction } from './feedback-types.js'
  import { uiM } from '../../../messages.js'
  import { portal } from '../../../utils.js'
  import Modal from '../../compounds/Modal.svelte'
  import FeedbackForm from './FeedbackForm.svelte'

  interface Props {
    open?: boolean
    onsubmit: FeedbackSubmitAction
    oncomplete?: (id: string) => void
  }

  let { open = $bindable(false), onsubmit, oncomplete }: Props = $props()
  let busy = $state(false)
</script>

<div use:portal class='contents'>
  <Modal bind:open title={uiM('feedback_title')} size='lg' closeOnBackdrop={!busy} closeOnEscape={!busy} showClose={!busy} data-testid='feedback-submit-dialog'>
    {#if open}
      <FeedbackForm {onsubmit} onbusy={(value) => { busy = value }} oncomplete={(id) => {
        open = false
        oncomplete?.(id)
      }} />
    {/if}
  </Modal>
</div>
