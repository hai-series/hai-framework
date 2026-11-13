<script lang='ts'>
  import { Button, Card } from '@h-ai/ui'
  import { errorMessage, useToastFeedback } from '@h-ai/ui/toast'
  // 文件语音识别面板：上传 WAV/MP3 一次性转写为文本
  import ApiGuide from '#lib/components/ApiGuide.svelte'
  import * as m from '#lib/paraglide/messages.js'
  import { streamTranscription, transcribe } from '#lib/services/ai-lab.js'

  let file = $state<File | undefined>()
  let language = $state<'auto' | 'zh' | 'en' | 'ja'>('auto')
  let busy = $state(false)
  let error = $state('')
  let transcript = $state('')
  let controller: AbortController | undefined

  function selectFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    file = input.files?.[0]
    transcript = ''
    error = ''
  }

  async function run(stream = false) {
    if (!file || busy)
      return
    busy = true
    error = ''
    transcript = ''
    const request = new AbortController()
    controller = request
    try {
      if (stream)
        await streamTranscription(file, language, (text) => { transcript = text }, request.signal)
      else
        transcript = (await transcribe(file, language)).text
      transcript ||= m.asr_empty_result()
    }
    catch (cause) {
      if (request.signal.aborted)
        return
      const detail = errorMessage(cause, m.error_unknown())
      error = m.error_request({ detail })
    }
    finally {
      busy = false
      controller = undefined
    }
  }
  $effect(() => () => controller?.abort())
  useToastFeedback(() => error)
</script>

<Card class='border border-base-content/8 bg-base-100/88 shadow-lg shadow-base-content/5'>
  <h2 class='flex items-center gap-2 text-lg font-semibold'>
    <span class='icon-[tabler--wave-sine] size-5 text-accent'></span>
    {m.asr_title()}
  </h2>
  <p class='mt-1 text-sm text-base-content/55'>{m.asr_description()}</p>

  <label class='mt-4 block rounded-2xl border border-dashed border-base-content/20 bg-base-200/60 p-5 text-center hover:border-primary/50'>
    <span class='icon-[tabler--file-music] mx-auto mb-2 block size-7 text-primary'></span>
    <span class='block text-sm font-medium'>{file?.name ?? m.asr_choose_file()}</span>
    <span class='mt-1 block text-xs text-base-content/45'>{m.asr_file_hint()}</span>
    <input class='sr-only' type='file' accept='.wav,.mp3,audio/wav,audio/mpeg' disabled={busy} onchange={selectFile} data-testid='asr-file' />
  </label>

  <label class='mt-3 block text-sm font-medium' for='asr-language'>{m.asr_language_label()}</label>
  <select id='asr-language' class='select select-bordered mt-2 w-full' disabled={busy} bind:value={language}>
    <option value='auto'>{m.asr_language_auto()}</option>
    <option value='zh'>{m.asr_language_zh()}</option>
    <option value='en'>{m.asr_language_en()}</option>
    <option value='ja'>{m.asr_language_ja()}</option>
  </select>
  {#if transcript}
    <div class='mt-4 rounded-2xl bg-base-200 p-4' data-testid='asr-result'>
      <div class='mb-2 text-xs font-semibold uppercase tracking-wider text-base-content/45'>{m.asr_result_label()}</div>
      <p class='text-sm leading-6 whitespace-pre-wrap'>{transcript}</p>
    </div>
  {/if}

  <Button class='mt-4 w-full' variant='default' onclick={() => run()} disabled={busy || !file} data-testid='asr-run'>
    {#if busy}<span class='loading loading-spinner loading-sm'></span>{/if}
    {busy
      ? m.asr_running()
      : m.asr_run()}
  </Button>
  <Button class='mt-2 w-full' variant='outline' onclick={() => run(true)} disabled={busy || !file} data-testid='asr-stream-run'>
    {m.asr_run_stream()}
  </Button>
  <p class='mt-2 text-xs text-base-content/65'>{m.asr_stream_hint()}</p>
  <ApiGuide id='asr-panel' />
</Card>
