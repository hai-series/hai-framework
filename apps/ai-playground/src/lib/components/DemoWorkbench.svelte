<script lang='ts'>
  import type { LabDemo, LabSection } from '#lib/components/lab-catalog.js'
  import { Badge, Button, Card } from '@h-ai/ui'
  import ApiGuide from '#lib/components/ApiGuide.svelte'
  import { labDemos } from '#lib/components/lab-catalog.js'
  import * as m from '#lib/paraglide/messages.js'
  import { runDemo } from '#lib/services/demo.js'

  interface Props {
    section: LabSection
    unavailable: Record<string, string>
  }

  const { section, unavailable }: Props = $props()
  const demos = $derived(labDemos.filter(demo => demo.section === section))
  let selectedId = $state('')
  const selected = $derived(demos.find(demo => demo.id === selectedId) ?? demos[0])
  let input = $state('')
  let output = $state('')
  let failed = $state(false)
  let busy = $state(false)
  let controller: AbortController | undefined

  function cancel() {
    controller?.abort()
    controller = undefined
    busy = false
  }

  function select(demo: LabDemo) {
    cancel()
    failed = false
    output = ''
    input = ''
    selectedId = demo.id
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!selected || busy || unavailable[selected.id])
      return
    const request = new AbortController()
    controller = request
    busy = true
    failed = false
    output = ''
    try {
      const result = await runDemo(selected.id, input.trim() || selected.example(), request.signal)
      if (!request.signal.aborted)
        output = JSON.stringify(result, null, 2)
    }
    catch {
      if (!request.signal.aborted)
        failed = true
    }
    finally {
      if (controller === request)
        cancel()
    }
  }

  $effect(() => () => controller?.abort())
</script>

{#if selected}
  <Card padding='none' class='overflow-hidden rounded-2xl border border-base-content/10 bg-base-100'>
    <div class='grid min-w-0 lg:grid-cols-[13rem_minmax(0,1fr)]'>
      <div class='flex gap-1.5 overflow-x-auto border-b border-base-content/10 bg-base-200/45 p-3 lg:flex-col lg:border-r lg:border-b-0' aria-label={m.lab_demo_examples()}>
        {#each demos as demo (demo.id)}
          <button
            type='button'
            data-testid={`demo-select-${demo.id}`}
            aria-pressed={selected.id === demo.id}
            class='flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-content/5 aria-pressed:bg-primary/10 aria-pressed:font-semibold aria-pressed:text-primary'
            onclick={() => select(demo)}
          >
            {demo.title()}
            {#if unavailable[demo.id]}
              <span class='size-1.5 rounded-full bg-warning' aria-label={m.demo_setup_required()}></span>
            {/if}
          </button>
        {/each}
      </div>
      <div class='min-w-0 p-5 sm:p-7'>
        <div class='flex flex-wrap items-center gap-2'>
          <h2 class='mr-1 text-lg font-semibold'>{selected.title()}</h2>
          <Badge size='sm' variant={unavailable[selected.id] ? 'warning' : 'primary'}>{unavailable[selected.id]
            ? m.demo_setup_required()
            : m.demo_runnable()}</Badge>
        </div>
        <p class='mt-2 max-w-3xl text-sm leading-6 text-base-content/70'>{selected.description()}</p>
        {#key selected.id}
          <ApiGuide id={selected.id} />
        {/key}
        {#if unavailable[selected.id]}
          <p class='mt-4 text-sm text-base-content/70' role='status'>{m.demo_setup_hint()}</p>
        {/if}
        <form class='mt-5' onsubmit={submit}>
          <label for='demo-input' class='mb-2 block text-sm font-semibold'>{m.demo_input()}</label>
          <textarea id='demo-input' data-testid='demo-input' class='textarea min-h-24 w-full bg-base-100' maxlength='2000' placeholder={selected.example()} bind:value={input}></textarea>
          <div class='mt-3 flex gap-2'>
            <Button type='submit' variant='primary' disabled={busy || !!unavailable[selected.id]} data-testid='demo-run'>
              {busy
                ? m.demo_running()
                : m.demo_run()}
            </Button>
            {#if busy}
              <Button type='button' variant='ghost' onclick={cancel}>{m.demo_cancel()}</Button>
            {/if}
          </div>
        </form>
        {#if failed}
          <p class='mt-4 text-sm text-error' role='alert'>{m.demo_request_failed()}</p>
        {:else if output}
          <div class='mt-5'>
            <h3 class='mb-2 text-sm font-semibold'>{m.demo_output()}</h3>
            <pre data-testid='demo-output' class='overflow-auto rounded-lg bg-base-200 p-4 text-xs leading-6 whitespace-pre-wrap wrap-anywhere'>{output}</pre>
          </div>
        {/if}
      </div>
    </div>
  </Card>
{/if}
