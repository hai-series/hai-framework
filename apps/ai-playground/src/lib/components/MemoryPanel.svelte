<script lang='ts'>
  // 记忆管理面板：按测试主体添加、检索、删除与清空长期记忆
  import type { MemoryView } from '$lib/ai-lab-types.js'
  import * as m from '$lib/paraglide/messages.js'
  import { clearMemories, createMemory, deleteMemory, loadMemories } from '$lib/services/ai-lab.js'
  import { Button, Card } from '@h-ai/ui'

  interface Props {
    profileId: string
    refreshToken: number
  }

  const { profileId, refreshToken }: Props = $props()
  let items = $state<MemoryView[]>([])
  let query = $state('')
  let content = $state('')
  let type = $state<MemoryView['type']>('preference')
  let importance = $state(0.7)
  let busy = $state(false)
  let error = $state('')

  const typeLabels = $derived<Record<MemoryView['type'], string>>({
    fact: m.memory_type_fact(),
    preference: m.memory_type_preference(),
    event: m.memory_type_event(),
    entity: m.memory_type_entity(),
    instruction: m.memory_type_instruction(),
  })

  async function refresh(targetProfileId = profileId, _refreshToken?: number) {
    busy = true
    error = ''
    try {
      items = await loadMemories(targetProfileId, query.trim())
    }
    catch (cause) {
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
    }
    finally {
      busy = false
    }
  }

  async function add() {
    if (!content.trim() || busy)
      return
    busy = true
    error = ''
    try {
      await createMemory({ profileId, content: content.trim(), type, importance })
      content = ''
      await refresh()
    }
    catch (cause) {
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
      busy = false
    }
  }

  async function remove(id: string) {
    busy = true
    error = ''
    try {
      await deleteMemory(profileId, id)
      await refresh()
    }
    catch (cause) {
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
      busy = false
    }
  }

  async function clearAll() {
    busy = true
    error = ''
    try {
      await clearMemories(profileId)
      items = []
    }
    catch (cause) {
      const detail = cause instanceof Error ? cause.message : m.error_unknown()
      error = m.error_request({ detail })
    }
    finally {
      busy = false
    }
  }

  function submitSearch(event: SubmitEvent) {
    event.preventDefault()
    void refresh()
  }

  $effect(() => {
    void refresh(profileId, refreshToken)
  })
</script>

<Card class='border border-base-content/8 bg-base-100/88 shadow-lg shadow-base-content/5'>
  <div class='flex items-start justify-between gap-3'>
    <div>
      <h2 class='flex items-center gap-2 text-lg font-semibold'>
        <span class='icon-[tabler--brain] size-5 text-primary'></span>
        {m.memory_title()}
      </h2>
      <p class='mt-1 text-sm text-base-content/55'>{m.memory_description()}</p>
    </div>
    <span class='badge badge-warning badge-outline shrink-0 whitespace-nowrap'>{m.memory_ephemeral()}</span>
  </div>

  <div class='mt-4 space-y-3 rounded-2xl bg-base-200/65 p-3'>
    <textarea class='textarea textarea-bordered min-h-20 w-full bg-base-100' bind:value={content} placeholder={m.memory_add_placeholder()} maxlength='2000'></textarea>
    <div class='grid grid-cols-[1fr_auto] gap-2'>
      <select class='select select-bordered w-full bg-base-100' bind:value={type} aria-label={m.memory_type_label()}>
        {#each Object.entries(typeLabels) as [value, label] (value)}
          <option value={value}>{label}</option>
        {/each}
      </select>
      <Button variant='primary' onclick={add} disabled={busy || !content.trim()} data-testid='memory-add'>{m.memory_add()}</Button>
    </div>
    <label class='flex items-center gap-3 text-xs text-base-content/60'>
      <span>{m.memory_importance()}</span>
      <input class='range range-primary range-xs flex-1' type='range' min='0' max='1' step='0.1' bind:value={importance} />
      <span class='w-8 tabular-nums'>{importance.toFixed(1)}</span>
    </label>
  </div>

  <form class='mt-4 flex gap-2' onsubmit={submitSearch}>
    <input class='input input-bordered min-w-0 flex-1' bind:value={query} placeholder={m.memory_search_placeholder()} aria-label={m.memory_search_label()} />
    <Button type='submit' variant='default' disabled={busy}>{m.memory_search()}</Button>
  </form>

  {#if error}
    <div class='alert alert-error mt-3 py-2 text-sm' role='alert'>{error}</div>
  {/if}

  <div class='mt-4 max-h-80 space-y-2 overflow-y-auto' data-testid='memory-list' aria-live='polite'>
    {#if busy && items.length === 0}
      <div class='flex justify-center py-6'><span class='loading loading-spinner text-primary'></span></div>
    {:else if items.length === 0}
      <div class='rounded-2xl border border-dashed border-base-content/15 py-7 text-center text-sm text-base-content/45'>{m.memory_empty()}</div>
    {:else}
      {#each items as item (item.id)}
        <article class='group rounded-2xl border border-base-content/8 bg-base-100 p-3'>
          <div class='flex items-start justify-between gap-2'>
            <div class='min-w-0'>
              <div class='mb-1 flex items-center gap-2'>
                <span class='badge badge-sm badge-outline'>{typeLabels[item.type]}</span>
                <span class='text-[0.68rem] text-base-content/40'>{m.memory_score({ score: item.importance.toFixed(1) })}</span>
              </div>
              <p class='text-sm leading-5'>{item.content}</p>
            </div>
            <button class='btn btn-ghost btn-xs text-error' type='button' onclick={() => remove(item.id)} aria-label={m.memory_delete()}>
              <span class='icon-[tabler--trash] size-4'></span>
            </button>
          </div>
        </article>
      {/each}
    {/if}
  </div>

  {#if items.length > 0}
    <Button class='mt-3 w-full' variant='ghost' onclick={clearAll} disabled={busy}>{m.memory_clear()}</Button>
  {/if}
</Card>
