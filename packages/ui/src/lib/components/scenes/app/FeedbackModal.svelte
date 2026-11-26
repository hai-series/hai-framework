<!-- @component FeedbackModal 提交反馈弹窗。 -->
<script lang='ts'>
  import type { FeedbackLimits } from '@h-ai/api-contract/feedback'
  import type { CaptureFile, FeedbackCaptureDraft } from './feedback-functions.js'
  import type { FeedbackLimitsAction, FeedbackSubmitAction } from './feedback-types.js'
  import { FeedbackLimitsSchema } from '@h-ai/api-contract/feedback'
  import { untrack } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { errorMessage } from '../../../toast.svelte.js'
  import { portal } from '../../../utils.js'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import { startBrowserFeedbackCapture } from './feedback-browser-capture.js'
  import { captureFileKeys, captureFiles, captureLabels } from './feedback-functions.js'
  import { captureFeedbackScreenshot } from './feedback-screenshot.js'
  import FeedbackCapturePreview from './FeedbackCapturePreview.svelte'
  import FeedbackForm from './FeedbackForm.svelte'
  import FeedbackRecorder from './FeedbackRecorder.svelte'

  interface Props {
    open?: boolean
    onsubmit: FeedbackSubmitAction
    oncomplete?: (id: string) => void
    captureKey?: string
    getLimits?: FeedbackLimitsAction
  }

  let { open = $bindable(false), onsubmit, oncomplete, captureKey, getLimits }: Props = $props()
  let settings = $state.raw<FeedbackLimits>()
  let limitsError = $state('')
  let limitsAttempt = $state(0)
  let busy = $state(false)
  let recording = $state(false)
  let takingScreenshot = $state(false)
  let screenshotError = $state(false)
  let collector = $state.raw<ReturnType<typeof startBrowserFeedbackCapture>>()
  let draft = $state.raw<FeedbackCaptureDraft>({})
  let preview = $state<CaptureFile>()
  const previewFile = $derived(preview ? draft[preview] : undefined)
  let screenshotPending: AbortController | undefined

  $effect(() => {
    const owner = captureKey
    const attempt = limitsAttempt
    const load = getLimits
    let active = true
    limitsError = ''
    settings = load
      ? undefined
      : FeedbackLimitsSchema.parse({})
    if (load) {
      function isCurrent() {
        return active && owner === captureKey && attempt === limitsAttempt
      }
      void Promise.resolve().then(load).then((result) => {
        if (!isCurrent())
          return
        if (result.success)
          settings = result.data
        else
          limitsError = errorMessage(result.error, uiM('feedback_action_failed'))
      }).catch((cause) => {
        if (isCurrent())
          limitsError = errorMessage(cause, uiM('feedback_action_failed'))
      })
    }
    return () => {
      active = false
    }
  })

  $effect(() => {
    if (!captureKey || !settings)
      return
    const instance = startBrowserFeedbackCapture(settings)
    collector = instance
    return () => {
      instance.close()
      collector = undefined
    }
  })

  $effect(() => {
    if (!open || !collector)
      return
    draft = collector.snapshot()
    preview = undefined
    screenshotError = false
    void untrack(takeScreenshot)
    return () => {
      screenshotPending?.abort()
      takingScreenshot = false
    }
  })

  async function takeScreenshot() {
    if (screenshotPending || !settings)
      return
    const controller = new AbortController()
    screenshotPending = controller
    takingScreenshot = true
    screenshotError = false
    const deadline = window.setTimeout(() => {
      controller.abort()
      screenshotError = true
      takingScreenshot = false
    }, 5000)
    try {
      const screenshot = await captureFeedbackScreenshot(settings.limits.maxFileBytes, controller.signal)
      if (!controller.signal.aborted)
        draft = { ...draft, screenshot }
    }
    catch {
      if (!controller.signal.aborted)
        screenshotError = true
    }
    finally {
      window.clearTimeout(deadline)
      screenshotPending = undefined
      takingScreenshot = false
    }
  }

  function remove(key: CaptureFile) {
    draft = { ...draft, [key]: undefined }
    if (preview === key)
      preview = undefined
  }
</script>

<div use:portal class='contents' data-feedback-ignore style:display={recording ? 'none' : undefined}>
  <Modal bind:open title={uiM('feedback_title')} size='lg' closeOnBackdrop={!busy} closeOnEscape={!busy} showClose={!busy} data-testid='feedback-submit-dialog'>
    {#if open}
      {#if !settings}
        {#if limitsError}
          <p role='alert' class='text-sm'>{limitsError}</p>
          <Button size='sm' variant='outline' onclick={() => { limitsAttempt++ }}>{uiM('feedback_refresh')}</Button>
        {:else}
          <p role='status' class='text-sm'>{uiM('feedback_loading')}</p>
        {/if}
      {:else}
        {#key captureKey}
          {#if captureKey}
            <fieldset class='mb-4 space-y-2 rounded-lg border border-base-content/15 p-3' disabled={busy} data-testid='feedback-capture'>
              <legend class='px-1 text-sm font-medium'>{uiM('feedback_capture_title')}</legend>
              <p class='text-xs text-base-content/70'>{uiM('feedback_capture_hint')}</p>
              <ul class='space-y-1'>
                {#each captureFileKeys as key (key)}
                  {#if draft[key]}
                    <li class='flex flex-wrap items-center gap-2' data-testid={`feedback-capture-${key}`}>
                      <span class='flex-1 text-sm'>{uiM(captureLabels[captureFiles[key]])}</span>
                      <Button size='xs' variant='ghost' onclick={() => {
                        preview = preview === key
                          ? undefined
                          : key
                      }}>{uiM('feedback_capture_preview')}</Button>
                      <Button size='xs' variant='ghost' onclick={() => remove(key)}>{uiM('feedback_remove')}</Button>
                    </li>
                  {/if}
                {/each}
              </ul>
              {#if preview && previewFile}
                {#key previewFile}
                  <FeedbackCapturePreview file={previewFile} kind={captureFiles[preview]} />
                {/key}
              {/if}
              <div class='flex flex-wrap items-start gap-x-2'>
                <Button size='sm' variant='ghost' loading={takingScreenshot} onclick={() => void takeScreenshot()}>{uiM('feedback_capture_retake')}</Button>
                <FeedbackRecorder maxBytes={settings.limits.maxFileBytes} maxSeconds={settings.capture.maxRecordingSeconds} disabled={busy || takingScreenshot} onrecord={async (file) => {
                  draft = { ...draft, recording: file }
                  preview = 'recording'
                }} onactive={(value) => { recording = value }} />
              </div>
              {#if screenshotError}<p class='text-xs text-base-content/70'>{uiM('feedback_capture_screenshot_failed')}</p>{/if}
              <label class='flex items-center gap-2 text-sm'>
                <input type='checkbox' class='checkbox checkbox-sm' checked={draft.includeServerLogs ?? false} onchange={(event) => {
                  draft = { ...draft, includeServerLogs: event.currentTarget.checked }
                }}>
                {uiM('feedback_capture_server_logs')}
              </label>
            </fieldset>
          {/if}
          <FeedbackForm {onsubmit} limits={settings.limits} capture={captureKey ? draft : undefined} preparing={takingScreenshot || recording} onbusy={(value) => { busy = value }} oncomplete={(id) => {
            open = false
            oncomplete?.(id)
          }} />
        {/key}
      {/if}
    {/if}
  </Modal>
</div>
