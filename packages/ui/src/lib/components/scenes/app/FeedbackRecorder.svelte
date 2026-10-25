<!-- 浏览器原生短录屏；用户主动授权，无声音，停止后交给宿主准备附件。 -->
<script lang='ts'>
  import { onMount } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { errorMessage } from '../../../toast.svelte.js'
  import { portal } from '../../../utils.js'
  import Button from '../../primitives/Button.svelte'

  const { disabled = false, maxBytes = 5 * 1024 * 1024, onrecord, onactive }: {
    disabled?: boolean
    maxBytes?: number
    onrecord: (file: File) => Promise<void>
    onactive: (active: boolean) => void
  } = $props()
  let supported = $state(false)
  let expanded = $state(false)
  let active = $state(false)
  let busy = $state(false)
  let seconds = $state(0)
  let error = $state('')
  let recorder: MediaRecorder | undefined
  let stream: MediaStream | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let mounted = true
  let cancelled = false

  function release() {
    clearInterval(timer)
    timer = undefined
    for (const track of stream?.getTracks() ?? [])
      track.stop()
    stream = undefined
  }
  function stop(discard = false) {
    cancelled ||= discard
    if (recorder?.state === 'recording') {
      recorder.stop()
      // 正常停止先让编码器发送最终数据；取消/卸载立即释放，正常路径由 onstop 释放。
      if (!discard)
        return
    }
    release()
  }
  async function start() {
    if (busy || active || disabled)
      return
    busy = true
    error = ''
    cancelled = false
    try {
      // 必须直接来自点击事件，保留浏览器的用户激活授权。
      const selected = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1280, height: 720, frameRate: 10 }, audio: false })
      if (!mounted) {
        selected.getTracks().forEach(track => track.stop())
        return
      }
      stream = selected
      const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType)
        throw new Error('No supported recording format')
      const current = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 500_000 })
      recorder = current
      const chunks: Blob[] = []
      let size = 0
      current.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data)
          size += event.data.size
          if (size >= maxBytes * 0.9)
            stop()
        }
      }
      current.onerror = (event) => {
        cancelled = true
        error = errorMessage('error' in event ? event.error : new Error('MediaRecorder failed'), uiM('feedback_record_failed'))
        stop(true)
      }
      current.onstart = () => {
        // 原生编码器可能延迟启动；录制时长必须从实际开始采集时计算。
        if (!mounted || cancelled || current.state !== 'recording')
          return
        const started = Date.now()
        timer = setInterval(() => {
          seconds = Math.floor((Date.now() - started) / 1000)
          if (seconds >= 60)
            stop()
        }, 250)
      }
      current.onstop = async () => {
        release()
        active = false
        busy = true
        try {
          if (!mounted || cancelled)
            return
          if (!size || size > maxBytes) {
            error = errorMessage(new Error('Recording output was empty or exceeded budget', { cause: { size, maxBytes, seconds, mimeType } }), uiM('feedback_record_empty'))
            return
          }
          const type = mimeType.split(';')[0]!
          await onrecord(new File(chunks, `recording-${Date.now()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type }))
          expanded = false
        }
        catch (cause) {
          error = errorMessage(cause, uiM('feedback_record_failed'))
        }
        finally {
          busy = false
          if (mounted)
            onactive(false)
        }
      }
      for (const track of stream.getVideoTracks())
        track.addEventListener('ended', () => stop(), { once: true })
      current.start(1000)
      seconds = 0
      active = true
      onactive(true)
    }
    catch (cause) {
      release()
      error = errorMessage(cause, uiM('feedback_record_failed'))
    }
    finally {
      busy = false
    }
  }

  onMount(() => {
    supported = typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
    return () => {
      mounted = false
      stop(true)
    }
  })
</script>

<div class='space-y-2 min-w-0'>
  <Button size='sm' variant='ghost' disabled={disabled || active || busy} onclick={() => expanded = !expanded}>{uiM('feedback_record')}</Button>
  {#if expanded}
    <p class='text-xs text-base-content/65'>{supported ? uiM('feedback_record_hint', { size: (maxBytes / 1048576).toFixed(1) }) : uiM('feedback_record_unsupported')}</p>
    {#if supported}<Button size='sm' loading={busy} disabled={disabled || active} onclick={start}>{uiM('feedback_record_start')}</Button>{/if}
  {/if}
  {#if error}<p class='text-error text-sm break-words' role='alert'>{error}</p>{/if}
</div>
{#if active}
  <div use:portal class='fixed bottom-4 inset-x-4 z-[1200] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-error/25 bg-base-100 p-4 shadow-xl' data-feedback-ignore='true'>
    <p class='text-sm' role='status'>{uiM('feedback_recording', { seconds })}</p>
    <div class='flex gap-2'>
      <Button size='sm' variant='ghost' onclick={() => stop(true)}>{uiM('feedback_record_cancel')}</Button>
      <Button size='sm' variant='error' onclick={() => stop()}>{uiM('feedback_record_stop')}</Button>
    </div>
  </div>
{/if}
