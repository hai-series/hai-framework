<script lang='ts'>
  import * as m from '$lib/paraglide/messages.js'

  interface VisionAnalysis {
    summary: string
    details: string[]
    tags: string[]
    confidence: number
  }

  interface VisionRecord {
    id: string
    key: string
    imageUrl: string | null
    fileName: string
    mimeType: string
    prompt: string | null
    analysis: string
    tags: string[]
    confidence: number
    createdAt: number
  }

  let file = $state<File | null>(null)
  let previewUrl = $state<string>('')
  let prompt = $state('')
  let loading = $state(false)
  let errorMessage = $state('')
  let result = $state<VisionAnalysis | null>(null)
  let history = $state<VisionRecord[]>([])

  $effect(() => {
    loadHistory()
  })

  async function loadHistory() {
    const res = await fetch('/api/vision/history')
    const json = await res.json()
    if (json.success) {
      history = json.data
    }
  }

  function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const selected = input.files?.[0] ?? null
    file = selected
    errorMessage = ''

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      previewUrl = ''
    }

    if (selected) {
      previewUrl = URL.createObjectURL(selected)
    }
  }

  async function analyze() {
    if (!file) {
      errorMessage = m.discover_error_no_file()
      return
    }

    loading = true
    errorMessage = ''

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('prompt', prompt)

      const res = await fetch('/api/vision/recognize', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!json.success) {
        errorMessage = json.error?.message ?? m.discover_error_failed()
        return
      }

      result = json.data.analysis
      await loadHistory()
    }
    catch {
      errorMessage = m.discover_error_failed()
    }
    finally {
      loading = false
    }
  }

</script>

<svelte:head>
  <title>{m.discover_title()} - {m.app_title()}</title>
</svelte:head>

<div class='p-4 space-y-4'>
  <!-- 标题横幅 -->
  <section class='rounded-2xl bg-linear-to-r from-primary to-secondary text-primary-content p-4 shadow-lg'>
    <h1 class='text-xl font-bold'>{m.discover_title()}</h1>
    <p class='text-sm opacity-90 mt-1'>{m.discover_subtitle()}</p>
  </section>

  <!-- 拍照 / 选择照片 -->
  <Card shadow='sm'>
    <div class='space-y-3'>
      <div class='flex items-center gap-2'>
        <Button variant='primary' size='sm'>
          <label class='cursor-pointer flex items-center gap-1'>
            <span class='icon-[tabler--camera] text-lg'></span>
            {m.discover_take_photo()}
            <input type='file' class='hidden' accept='image/*' capture='environment' onchange={onFileChange} />
          </label>
        </Button>
        <Button variant='outline' size='sm'>
          <label class='cursor-pointer flex items-center gap-1'>
            <span class='icon-[tabler--photo] text-lg'></span>
            {m.discover_select_photo()}
            <input type='file' class='hidden' accept='image/*' onchange={onFileChange} />
          </label>
        </Button>
      </div>
      <p class='text-xs text-base-content/60'>{m.discover_upload_hint()}</p>

      {#if previewUrl}
        <div class='rounded-xl overflow-hidden border border-base-300 bg-base-200'>
          <img src={previewUrl} alt='preview' class='w-full object-cover max-h-72' />
        </div>
      {/if}

      <label class='label pb-1 font-medium text-sm' for='vision-prompt'>
        {m.discover_prompt_label()}
      </label>
      <Textarea
        id='vision-prompt'
        bind:value={prompt}
        placeholder={m.discover_prompt_placeholder()}
        rows={3}
      />

      {#if errorMessage}
        <Alert variant='error'>{errorMessage}</Alert>
      {/if}

      <Button variant='primary' class='w-full' loading={loading} onclick={analyze}>
        {#if loading}
          {m.discover_analyzing()}
        {:else}
          <span class='icon-[tabler--sparkles] text-lg'></span>
          {m.discover_analyze()}
        {/if}
      </Button>
    </div>
  </Card>

  <!-- 识别结果 -->
  {#if result}
    <Card shadow='sm' title={m.discover_result()}>
      <div class='space-y-3'>
        <div class='bg-base-200 rounded-xl p-3'>
          <p class='font-medium text-sm'>{result.summary}</p>
          {#if result.details.length > 0}
            <ul class='mt-2 space-y-1 list-disc list-inside text-sm text-base-content/80'>
              {#each result.details as detail}
                <li>{detail}</li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class='flex flex-wrap gap-2 items-center'>
          <span class='text-sm text-base-content/70'>{m.discover_tags()}:</span>
          {#each result.tags as tag}
            <Tag text={tag} variant='primary' outline size='sm' />
          {/each}
        </div>

        <Progress value={Math.round(result.confidence * 100)} max={100} variant='primary' showLabel />
        <p class='text-xs text-base-content/70'>
          {m.discover_confidence()}: {Math.round(result.confidence * 100)}%
        </p>
      </div>
    </Card>
  {/if}

  <!-- 历史记录 -->
  <section class='space-y-2'>
    <h2 class='font-semibold text-base'>{m.discover_history()}</h2>

    {#if history.length === 0}
      <Card shadow='sm' bordered>
        <Empty title={m.discover_empty()} icon='search' size='sm' />
      </Card>
    {:else}
      {#each history as item}
        <Card shadow='sm' padding='sm'>
          <div class='flex items-start justify-between gap-3'>
            <div>
              <p class='font-medium text-sm line-clamp-2'>{item.analysis}</p>
              <p class='text-xs text-base-content/60 mt-1'>{new Date(item.createdAt).toLocaleString()}</p>
            </div>
            <Badge variant='ghost'>{Math.round(item.confidence * 100)}%</Badge>
          </div>
          {#if item.tags.length > 0}
            <div class='flex flex-wrap gap-1 mt-2'>
              {#each item.tags as tag}
                <Tag text={tag} size='sm' outline />
              {/each}
            </div>
          {/if}
        </Card>
      {/each}
    {/if}
  </section>
</div>
