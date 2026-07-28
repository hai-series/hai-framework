<script lang='ts'>
  // 文生图面板：UI 仅负责收集提示词、调用 service 并展示返回图片
  import * as m from '$lib/paraglide/messages.js'
  import { generateImage } from '$lib/services/ai-lab.js'
  import { Button, Card } from '@h-ai/ui'

  let prompt = $state(m.image_default_prompt())
  let size = $state('1024x1024')
  let busy = $state(false)
  let error = $state('')
  let imageUrl = $state('')
  let referenceImages = $state<File[]>([])

  function selectReferenceImages(event: Event) {
    referenceImages = Array.from((event.currentTarget as HTMLInputElement).files ?? [])
  }

  async function run() {
    if (!prompt.trim() || busy)
      return
    busy = true
    error = ''
    if (imageUrl)
      URL.revokeObjectURL(imageUrl)
    imageUrl = ''
    try {
      const [width, height] = size.split('x').map(Number)
      const image = await generateImage({ prompt: prompt.trim(), width: width!, height: height!, referenceImages })
      imageUrl = URL.createObjectURL(image)
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
    if (imageUrl)
      URL.revokeObjectURL(imageUrl)
  })
</script>

<Card class='border border-base-content/8 bg-base-100/88 shadow-lg shadow-base-content/5'>
  <h2 class='flex items-center gap-2 text-lg font-semibold'>
    <span class='icon-[tabler--photo-ai] size-5 text-primary'></span>
    {m.image_title()}
  </h2>
  <p class='mt-1 text-sm text-base-content/55'>{m.image_description()}</p>

  <label class='mt-4 block text-sm font-medium' for='image-prompt'>{m.image_prompt_label()}</label>
  <textarea id='image-prompt' class='textarea textarea-bordered mt-2 min-h-28 w-full' bind:value={prompt} maxlength='4000'></textarea>

  <label class='mt-3 block text-sm font-medium' for='image-references'>{m.image_references_label()}</label>
  <input
    id='image-references'
    class='file-input file-input-bordered mt-2 w-full'
    type='file'
    accept='image/*'
    multiple
    onchange={selectReferenceImages}
    data-testid='image-references'
  />
  <p class='mt-1 text-xs text-base-content/50'>{m.image_references_hint()}</p>

  <label class='mt-3 block text-sm font-medium' for='image-size'>{m.image_size_label()}</label>
  <select id='image-size' class='select select-bordered mt-2 w-full' bind:value={size}>
    <option value='1024x1024'>1024 × 1024</option>
    <option value='1536x1024'>1536 × 1024</option>
    <option value='1024x1536'>1024 × 1536</option>
  </select>

  {#if error}
    <div class='alert alert-error mt-3 py-2 text-sm' role='alert'>{error}</div>
  {/if}
  {#if imageUrl}
    <img class='mt-4 w-full rounded-xl border border-base-content/10 object-contain' src={imageUrl} alt={m.image_result_alt()} data-testid='image-result' />
  {/if}

  <Button class='mt-4 w-full' onclick={run} disabled={busy || !prompt.trim()} data-testid='image-run'>
    {#if busy}<span class='loading loading-spinner loading-sm'></span>{/if}
    {busy ? m.image_running() : m.image_run()}
  </Button>
</Card>
