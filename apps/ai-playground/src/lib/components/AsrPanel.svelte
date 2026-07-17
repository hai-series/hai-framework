<script lang='ts'>
  // 文件语音识别面板：上传 WAV/MP3 一次性转写为文本
  import * as m from '$lib/paraglide/messages.js'
  import { transcribe } from '$lib/services/ai-lab.js'
  import { Button, Card } from '@h-ai/ui'

  let file = $state<File | undefined>()
  let language = $state<'auto' | 'zh' | 'en'>('auto')
  let busy = $state(false)
  let error = $state('')
  let transcript = $state('')

  function selectFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    file = input.files?.[0]
    transcript = ''
    error = ''
  }

  async function run() {
    if (!file || busy)
      return
    busy = true
    error = ''
    transcript = ''
    try {
      const result = await transcribe(file, language)
      transcript = result.text || m.asr_empty_result()
    }
    catch (cause) {
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
    }
    finally {
      busy = false
    }
  }
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
    <input class='sr-only' type='file' accept='.wav,.mp3,audio/wav,audio/mpeg' onchange={selectFile} data-testid='asr-file' />
  </label>

  <label class='mt-3 block text-sm font-medium' for='asr-language'>{m.asr_language_label()}</label>
  <select id='asr-language' class='select select-bordered mt-2 w-full' bind:value={language}>
    <option value='auto'>{m.asr_language_auto()}</option>
    <option value='zh'>{m.asr_language_zh()}</option>
    <option value='en'>{m.asr_language_en()}</option>
  </select>

  {#if error}
    <div class='alert alert-error mt-3 py-2 text-sm' role='alert'>{error}</div>
  {/if}
  {#if transcript}
    <div class='mt-4 rounded-2xl bg-base-200 p-4' data-testid='asr-result'>
      <div class='mb-2 text-xs font-semibold uppercase tracking-wider text-base-content/45'>{m.asr_result_label()}</div>
      <p class='text-sm leading-6 whitespace-pre-wrap'>{transcript}</p>
    </div>
  {/if}

  <Button class='mt-4 w-full' variant='default' onclick={run} disabled={busy || !file} data-testid='asr-run'>
    {#if busy}<span class='loading loading-spinner loading-sm'></span>{/if}
    {busy ? m.asr_running() : m.asr_run()}
  </Button>
</Card>
