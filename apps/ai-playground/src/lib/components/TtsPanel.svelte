<script lang='ts'>
  // 语音合成面板：将文本合成为可播放的 WAV，音色列表由服务端配置注入
  import * as m from '$lib/paraglide/messages.js'
  import { synthesize } from '$lib/services/ai-lab.js'
  import { Button, Card } from '@h-ai/ui'

  interface Props {
    voices?: string[]
  }

  const { voices = [] }: Props = $props()
  let text = $state(m.tts_default_text())
  let voice = $state('')
  let instruction = $state(m.tts_default_instruction())
  let busy = $state(false)
  let error = $state('')
  let audioUrl = $state('')

  // 音色列表由服务端配置注入，首次加载后自动选中第一个可用音色
  $effect(() => {
    if (!voice && voices.length > 0)
      voice = voices[0]
  })

  async function run() {
    if (!text.trim() || busy)
      return
    busy = true
    error = ''
    if (audioUrl)
      URL.revokeObjectURL(audioUrl)
    audioUrl = ''
    try {
      const audio = await synthesize({
        text: text.trim(),
        voice,
        instruction: instruction.trim() || undefined,
      })
      audioUrl = URL.createObjectURL(audio)
    }
    catch (cause) {
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
    }
    finally {
      busy = false
    }
  }

  $effect(() => () => {
    if (audioUrl)
      URL.revokeObjectURL(audioUrl)
  })
</script>

<Card class='border border-base-content/8 bg-base-100/88 shadow-lg shadow-base-content/5'>
  <h2 class='flex items-center gap-2 text-lg font-semibold'>
    <span class='icon-[tabler--volume] size-5 text-secondary'></span>
    {m.tts_title()}
  </h2>
  <p class='mt-1 text-sm text-base-content/55'>{m.tts_description()}</p>

  <label class='mt-4 block text-sm font-medium' for='tts-text'>{m.tts_text_label()}</label>
  <textarea id='tts-text' class='textarea textarea-bordered mt-2 min-h-24 w-full' bind:value={text} maxlength='2000'></textarea>

  <div class='mt-3 grid grid-cols-2 gap-3'>
    <label class='form-control'>
      <span class='mb-2 text-sm font-medium'>{m.tts_voice_label()}</span>
      <select class='select select-bordered w-full' bind:value={voice}>
        {#each voices as item (item)}
          <option value={item}>{item}</option>
        {/each}
      </select>
    </label>
    <label class='form-control'>
      <span class='mb-2 text-sm font-medium'>{m.tts_instruction_label()}</span>
      <input class='input input-bordered w-full' bind:value={instruction} maxlength='1000' />
    </label>
  </div>

  {#if error}
    <div class='alert alert-error mt-3 py-2 text-sm' role='alert'>{error}</div>
  {/if}
  {#if audioUrl}
    <audio class='mt-4 w-full' src={audioUrl} controls data-testid='tts-audio'></audio>
  {/if}

  <Button class='mt-4 w-full' variant='secondary' onclick={run} disabled={busy || !text.trim()} data-testid='tts-run'>
    {#if busy}<span class='loading loading-spinner loading-sm'></span>{/if}
    {busy ? m.tts_running() : m.tts_run()}
  </Button>
</Card>
