<script lang='ts'>
  // 麦克风实时转写面板：录音期间周期转写当前快照，停止时仅补齐最后一段
  import { blobToWav } from '$lib/audio/wav.js'
  import * as m from '$lib/paraglide/messages.js'
  import { transcribe } from '$lib/services/ai-lab.js'
  import { Button, Card } from '@h-ai/ui'

  /** 面板阶段：空闲 / 录音并实时转写 / 完成最后一段转写 */
  type Phase = 'idle' | 'recording' | 'finalizing'

  const TRANSCRIBE_INTERVAL_SECONDS = 2

  let language = $state<'auto' | 'zh' | 'en'>('auto')
  let phase = $state<Phase>('idle')
  let transcript = $state('')
  let error = $state('')
  let seconds = $state(0)
  let liveTranscribing = $state(false)

  // 非响应式引用：录音器、音频流、数据分片、转写任务与计时器
  let mediaRecorder: MediaRecorder | undefined
  let mediaStream: MediaStream | undefined
  let chunks: Blob[] = []
  let activeTranscription: Promise<void> | undefined
  let lastTranscribedBytes = 0
  let recordingId = 0
  let timer: ReturnType<typeof setInterval> | undefined

  // 浏览器能力检测（SSR 时相关 API 不存在，返回 false）
  const supported = $derived(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined')

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  /** 停止并释放麦克风音频流。 */
  function releaseStream() {
    mediaStream?.getTracks().forEach(track => track.stop())
    mediaStream = undefined
  }

  /** 获取当前已录制音频的不可变快照。 */
  function recordingSnapshot(): Blob {
    return new Blob([...chunks], { type: chunks[0]?.type || mediaRecorder?.mimeType || 'audio/webm' })
  }

  /** 转写一个录音快照；仅当前录音会更新 UI，避免旧任务覆盖新会话。 */
  async function transcribeSnapshot(recorded: Blob, currentRecordingId: number): Promise<void> {
    liveTranscribing = true
    try {
      const wav = await blobToWav(recorded)
      const file = new File([wav], 'mic.wav', { type: 'audio/wav' })
      const result = await transcribe(file, language)
      if (currentRecordingId !== recordingId)
        return
      transcript = result.text
      error = ''
      lastTranscribedBytes = recorded.size
    }
    catch (cause) {
      if (currentRecordingId !== recordingId)
        return
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
    }
    finally {
      if (currentRecordingId === recordingId)
        liveTranscribing = false
    }
  }

  /** 在录音期间启动一次快照转写；慢请求未完成时跳过本节拍。 */
  function transcribeLiveSnapshot() {
    if (phase !== 'recording' || activeTranscription)
      return
    const recorded = recordingSnapshot()
    if (recorded.size === 0 || recorded.size === lastTranscribedBytes)
      return
    const currentRecordingId = recordingId
    activeTranscription = transcribeSnapshot(recorded, currentRecordingId).finally(() => {
      activeTranscription = undefined
    })
  }

  /** 请求麦克风权限并开始录音与周期转写。 */
  async function start() {
    if (!supported) {
      error = m.mic_error_unsupported()
      return
    }
    error = ''
    transcript = ''
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }
    catch {
      error = m.mic_error_permission()
      return
    }

    recordingId += 1
    chunks = []
    lastTranscribedBytes = 0
    mediaRecorder = new MediaRecorder(mediaStream)
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0)
        chunks.push(event.data)
    }
    mediaRecorder.onstop = () => void finalizeRecording(recordingId)
    mediaRecorder.start(500)

    phase = 'recording'
    seconds = 0
    timer = setInterval(() => {
      seconds += 1
      if (seconds % TRANSCRIBE_INTERVAL_SECONDS === 0)
        transcribeLiveSnapshot()
    }, 1000)
  }

  /** 停止录音；已显示的实时结果保留，只补转停止前新增的尾段。 */
  function stop() {
    if (phase !== 'recording')
      return
    stopTimer()
    phase = 'finalizing'
    mediaRecorder?.stop()
  }

  /** 等待正在进行的实时请求，再转写包含最终数据块的完整快照。 */
  async function finalizeRecording(currentRecordingId: number) {
    releaseStream()
    if (activeTranscription)
      await activeTranscription

    const recorded = recordingSnapshot()
    if (recorded.size === 0) {
      error = m.mic_error_empty()
      phase = 'idle'
      return
    }
    if (recorded.size !== lastTranscribedBytes)
      await transcribeSnapshot(recorded, currentRecordingId)
    if (currentRecordingId === recordingId)
      phase = 'idle'
  }

  // 组件卸载时使异步任务失效，并释放麦克风与计时器
  $effect(() => () => {
    recordingId += 1
    stopTimer()
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.onstop = null
      mediaRecorder.stop()
    }
    releaseStream()
  })
</script>

<Card class='border border-base-content/8 bg-base-100/88 shadow-lg shadow-base-content/5'>
  <h2 class='flex items-center gap-2 text-lg font-semibold'>
    <span class='icon-[tabler--microphone] size-5 text-accent'></span>
    {m.mic_title()}
  </h2>
  <p class='mt-1 text-sm text-base-content/55'>{m.mic_description()}</p>

  <label class='mt-4 block text-sm font-medium' for='mic-language'>{m.asr_language_label()}</label>
  <select id='mic-language' class='select select-bordered mt-2 w-full' bind:value={language} disabled={phase !== 'idle'}>
    <option value='auto'>{m.asr_language_auto()}</option>
    <option value='zh'>{m.asr_language_zh()}</option>
    <option value='en'>{m.asr_language_en()}</option>
  </select>

  <div class='mt-4 min-h-24 rounded-lg bg-base-200 p-4' data-testid='mic-result'>
    <div class='mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase text-base-content/45'>
      <span>{m.mic_result_label()}</span>
      {#if phase === 'recording'}
        <span class='flex items-center gap-1 text-error'>
          <span class='inline-block size-2 animate-pulse rounded-full bg-error'></span>
          {m.mic_recording()} · {seconds}s
          {#if liveTranscribing}<span class='loading loading-dots loading-xs text-primary'></span>{/if}
        </span>
      {:else if phase === 'finalizing'}
        <span class='flex items-center gap-1 text-primary'>
          <span class='loading loading-dots loading-xs'></span>
          {m.mic_transcribing()}
        </span>
      {/if}
    </div>
    {#if transcript}
      <p class='text-sm leading-6 whitespace-pre-wrap'>{transcript}</p>
    {:else}
      <p class='text-sm text-base-content/40'>{m.mic_placeholder()}</p>
    {/if}
  </div>

  {#if error}
    <div class='alert alert-error mt-3 py-2 text-sm' role='alert'>{error}</div>
  {/if}

  {#if phase === 'recording'}
    <Button class='mt-4 w-full' variant='error' onclick={stop} data-testid='mic-stop'>
      <span class='icon-[tabler--player-stop] size-4'></span>
      {m.mic_stop()}
    </Button>
  {:else}
    <Button class='mt-4 w-full' variant='primary' onclick={start} disabled={!supported || phase === 'finalizing'} data-testid='mic-start'>
      {#if phase === 'finalizing'}<span class='loading loading-spinner loading-sm'></span>{/if}
      <span class='icon-[tabler--microphone] size-4'></span>
      {phase === 'finalizing' ? m.mic_transcribing() : m.mic_start()}
    </Button>
  {/if}
</Card>
