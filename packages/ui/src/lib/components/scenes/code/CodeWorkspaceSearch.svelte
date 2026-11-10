<script lang='ts'>
  import type { CodeWorkspaceSearchHit, CodeWorkspaceSearchQuery, CodeWorkspaceSource } from './code-types.js'
  import { untrack } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import { uiM } from '../../../messages.js'
  import Button from '../../primitives/Button.svelte'

  /**
   * 工作区搜索的内部接线。
   *
   * @example 模块内部上下文
   * ```ts
   * const props: Props = {
   *   source: { listChildren: () => [], readFile: () => ({ text: '' }) },
   *   mode: 'files',
   *   onopen: hit => hit.node.id,
   * }
   * ```
   */
  interface Props {
    source: CodeWorkspaceSource
    mode: CodeWorkspaceSearchQuery['mode'] | null
    onopen: (hit: CodeWorkspaceSearchHit) => void
  }

  const { source, mode, onopen }: Props = $props()
  let input = $state<HTMLInputElement>()
  let query = $state('')
  let hits = $state.raw<readonly CodeWorkspaceSearchHit[]>([])
  let cursor = $state<string>()
  let loading = $state(false)
  let failed = $state(false)
  let retry = $state(0)
  let current: AbortController | undefined

  const groups = $derived.by(() => {
    const grouped = new SvelteMap<string, CodeWorkspaceSearchHit[]>()
    for (const hit of hits) {
      const key = JSON.stringify([hit.node.id, hit.node.version])
      const group = grouped.get(key)
      if (group)
        group.push(hit)
      else
        grouped.set(key, [hit])
    }
    return [
      ...grouped.values(),
    ]
  })

  const placeholder = $derived(uiM(mode === 'files'
    ? 'code_searchPlaceholderFiles'
    : 'code_searchPlaceholderContent'))

  /**
   * 将焦点移到工作区搜索输入框。
   *
   * @example 模块内部上下文
   * ```ts
   * focus()
   * ```
   */
  export function focus() {
    input?.focus()
  }

  async function load(
    search: NonNullable<CodeWorkspaceSource['search']>,
    request: CodeWorkspaceSearchQuery,
    controller: AbortController,
  ) {
    loading = true
    failed = false
    try {
      const page = await search(request, controller.signal)
      if (controller.signal.aborted)
        return
      hits = request.cursor
        ? [
          ...hits,
          ...page.hits,
        ]
        : page.hits
      cursor = page.nextCursor === request.cursor
        ? undefined
        : page.nextCursor
    }
    catch {
      if (!controller.signal.aborted)
        failed = true
    }
    finally {
      if (!controller.signal.aborted)
        loading = false
    }
  }

  $effect(() => {
    const value = query.trim()
    const searchMode = mode
    const search = source.search?.bind(source)
    void retry
    return untrack(() => {
      const controller = new AbortController()
      current = controller
      hits = []
      cursor = undefined
      failed = false
      loading = Boolean(value && searchMode && search)
      const timer = value && searchMode && search
        ? setTimeout(() => void load(search, { mode: searchMode, query: value }, controller), 180)
        : undefined
      return () => {
        clearTimeout(timer)
        controller.abort()
        if (current === controller)
          current = undefined
      }
    })
  })

  function loadMore() {
    if (current && source.search && mode && cursor && !loading) {
      void load(source.search, {
        mode,
        query: query.trim(),
        cursor,
      }, current)
    }
  }

  function oninputkey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      const first = input?.parentElement?.querySelector<HTMLButtonElement>('.result')
      if (first) {
        event.preventDefault()
        first.focus()
      }
    }
    else if (event.key === 'Enter' && hits[0]) {
      event.preventDefault()
      onopen(hits[0])
    }
  }
</script>

{#if mode}
  <div class='search'>
    <input
      bind:this={input}
      bind:value={query}
      class='input input-sm'
      type='search'
      aria-label={placeholder}
      {placeholder}
      autocomplete='off'
      onkeydown={oninputkey}
    />
    <div class='results' aria-busy={loading}>
      {#each groups as group (group[0])}
        {@const hit = group[0]!}
        {@const path = [
          ...(hit.ancestors ?? []).map(folder => folder.name),
          hit.node.name,
        ].join('/')}
        {#if mode === 'files'}
          <button
            type='button'
            class='result file'
            title={path}
            onclick={() => onopen(hit)}
          >
            <strong>{hit.node.name}</strong>
            {#if hit.ancestors?.length}
              <small>{hit.ancestors.map(folder => folder.name).join('/')}</small>
            {/if}
          </button>
        {:else}
          <div class='group' title={path}>{path}</div>
          {#each group as match, index (index)}
            <button
              type='button'
              class='result match'
              aria-label={match.range
                ? uiM('code_searchMatch', { name: hit.node.name, line: match.range.startLine, column: match.range.startColumn })
                : hit.node.name}
              onclick={() => onopen(match)}
            >
              {#if match.range}
                <small>{match.range.startLine}:{match.range.startColumn}</small>
              {/if}
              <span>{match.preview ?? match.node.name}</span>
            </button>
          {/each}
        {/if}
      {/each}
      {#if loading}
        <p class='notice' role='status'>{uiM('code_searchLoading')}</p>
      {:else if failed}
        <div class='notice'>
          <p role='alert'>{uiM('code_searchFailed')}</p>
          <Button size='xs' variant='ghost' onclick={() => cursor
            ? loadMore()
            : retry++}>{uiM('code_retry')}</Button>
        </div>
      {:else if query.trim() && !hits.length}
        <p class='notice' role='status'>{uiM('code_searchEmpty')}</p>
      {:else if hits.length}
        <span class='sr-only' role='status'>{uiM('code_searchCount', { count: hits.length })}</span>
        {#if cursor}
          <div class='notice'>
            <Button size='xs' variant='ghost' onclick={loadMore}>{uiM('code_more')}</Button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .search { display: flex; flex: 1; flex-direction: column; min-height: 0; gap: .45rem; padding: .35rem; }
  input { width: 100%; }
  .results { overflow: auto; }
  .result { display: flex; width: 100%; min-width: 0; align-items: baseline; gap: .4rem; padding: .28rem .45rem; text-align: start; border-radius: .25rem; }
  .result:hover { background: var(--color-base-300); }
  .result:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
  .file { flex-direction: column; gap: 0; }
  .result span, .result strong, .result small, .group { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result small { opacity: .72; }
  .match small { flex: none; font-variant-numeric: tabular-nums; }
  .match span { font-family: ui-monospace, monospace; font-size: .76rem; }
  .group { padding: .4rem .45rem .1rem; font-size: .75rem; font-weight: 600; }
  .notice { padding: .4rem; font-size: .8rem; }
</style>
