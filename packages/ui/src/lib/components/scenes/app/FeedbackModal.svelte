<!--
  @component FeedbackModal
  一键问题反馈弹窗。宿主先准备现场，再打开弹窗；采集与上传通过回调接入。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { FeedbackModal } from '@h-ai/ui'
  const props: ComponentProps<typeof FeedbackModal> = { open: true, onsubmit: async () => ({ number: 'FB-1', collectionStatus: 'collecting' }) }
  const component = mount(FeedbackModal, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { ComponentProps } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { errorMessage, useToastFeedback } from '../../../toast.svelte.js'
  import { getDataAttributes, portal } from '../../../utils.js'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import FeedbackForm from './FeedbackForm.svelte'

  let { open = $bindable(false), ...restProps }: ComponentProps<typeof FeedbackForm> & { open?: boolean } = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  const formProps = $derived(Object.fromEntries(Object.entries(restProps).filter(([key]) => !key.startsWith('data-'))) as ComponentProps<typeof FeedbackForm>)
  let selectingPage = $state(false)
  let captureTarget = $state<string>()
  let capturing = $state(false)
  let captureError = $state('')

  function selectPage(attachmentId?: string) {
    captureTarget = attachmentId
    captureError = ''
    selectingPage = true
    open = false
  }
  function returnToFeedback() {
    selectingPage = false
    open = true
  }
  function recordingChanged(active: boolean) {
    open = !active
    formProps.onrecordingchange?.(active)
  }
  async function capture() {
    if (capturing)
      return
    capturing = true
    captureError = ''
    try {
      await formProps.oncapture?.(captureTarget)
      selectingPage = false
      open = true
    }
    catch (cause) {
      captureError = errorMessage(cause, uiM('feedback_action_failed'))
    }
    finally {
      capturing = false
    }
  }
  useToastFeedback(() => captureError)
</script>

<!-- 脱离顶栏的 fixed 包含块与层叠上下文；包装层不参与布局，卸载由 portal 清理。 -->
<div use:portal class='contents'>
  {#if selectingPage && !open}
    <aside class='fixed inset-x-4 bottom-4 z-[1200] mx-auto max-w-xl rounded-xl border border-base-content/15 bg-base-100 p-4 shadow-xl space-y-3' data-feedback-ignore='true' aria-label={uiM('feedback_capture_add')}>
      <p class='text-sm' role='status'>{uiM('feedback_capture_hint')}</p>
      <div class='flex flex-wrap justify-end gap-2'>
        <Button size='sm' variant='ghost' disabled={capturing} onclick={returnToFeedback}>{uiM('feedback_capture_return')}</Button>
        <Button size='sm' variant='primary' loading={capturing} onclick={capture}>{uiM('feedback_capture_now')}</Button>
      </div>
    </aside>
  {/if}
  <Modal {...dataAttributes} bind:open title={formProps.labels?.title ?? uiM('feedback_title')} size='lg' bodyOverflow='hidden' bodyClass='flex flex-col' data-feedback-ui='true' data-feedback-ignore='true'>
    <FeedbackForm {...formProps} onrecordingchange={recordingChanged} oncapture={formProps.oncapture ? selectPage : undefined} oncancel={() => {
      open = false
      formProps.oncancel?.()
    }} oncomplete={() => {
      open = false
      formProps.oncomplete?.()
    }} />
  </Modal>
</div>
