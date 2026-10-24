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
  import { getDataAttributes } from '../../../utils.js'
  import Modal from '../../compounds/Modal.svelte'
  import FeedbackForm from './FeedbackForm.svelte'

  let { open = $bindable(false), ...restProps }: ComponentProps<typeof FeedbackForm> & { open?: boolean } = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  const formProps = $derived(Object.fromEntries(Object.entries(restProps).filter(([key]) => !key.startsWith('data-'))) as ComponentProps<typeof FeedbackForm>)
</script>

<Modal {...dataAttributes} bind:open title={formProps.labels?.title ?? uiM('feedback_title')} size='lg' data-feedback-ui='true' data-feedback-ignore='true'>
  <FeedbackForm {...formProps} oncancel={() => {
    open = false
    formProps.oncancel?.()
  }} oncomplete={() => {
    open = false
    formProps.oncomplete?.()
  }} />
</Modal>
