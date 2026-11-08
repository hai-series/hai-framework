<script lang='ts'>
  import type { SearchEntry } from '#lib/docs-types.js'
  import { resolve } from '$app/paths'
  import { Input, Modal } from '@h-ai/ui'
  import { notifyError } from '@h-ai/ui/toast'
  import { untrack } from 'svelte'
  import * as m from '#lib/paraglide/messages.js'
  import { loadSearchIndex, searchDocuments } from '#lib/services/search.js'

  // Vite 配置固定 paths.relative=false，HTTP 前缀不会随 SSR 页面深度改变。
  const base = resolve('/').replace(/\/$/, '')

  let { open = $bindable(false) }: { open?: boolean } = $props()
  let query = $state('')
  let entries = $state<SearchEntry[]>([])
  let loading = $state(false)
  let failed = $state(false)
  let attempted = false
  const results = $derived(searchDocuments(query, entries))

  async function load() {
    if (entries.length || loading)
      return
    loading = true
    failed = false
    try {
      entries = await loadSearchIndex(`${base}/search-index.json`)
    }
    catch (error) {
      failed = true
      notifyError(error, m.site_search_failed())
    }
    finally {
      loading = false
    }
  }
  $effect(() => {
    if (open) {
      untrack(() => {
        if (!attempted) {
          attempted = true
          void load()
        }
      })
    }
  })
</script>

<Modal bind:open title={m.site_search_title()} size='lg'>
  <label class='sr-only' for='documentation-search'>{m.site_search_title()}</label>
  <Input id='documentation-search' type='search' bind:value={query} placeholder={m.site_search_placeholder()} />
  <div class='search-results' aria-live='polite' aria-busy={loading}>
    {#if loading}
      <p class='state-copy'>{m.site_search_loading()}</p>
    {:else if failed}
      <button class='btn btn-outline btn-sm mt-4' type='button' onclick={load}>{m.site_retry()}</button>
    {:else if !query.trim()}
      <p class='state-copy'>{m.site_search_hint()}</p>
    {:else if !results.length}
      <p class='state-copy'>{m.site_search_empty()}</p>
    {:else}
      <ul>
        {#each results as result (result.href)}
          <li><a href={resolve('/docs/[...slug]', {
            slug: result.href.slice(`${base}/docs/`.length).replace(/\/$/, ''),
          })} onclick={() => { open = false }}><strong>{result.title}</strong><span>{result.excerpt}</span></a></li>
        {/each}
      </ul>
    {/if}
  </div>
</Modal>
