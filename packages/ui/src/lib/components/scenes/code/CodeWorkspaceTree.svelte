<script lang='ts'>
  import type { CodeWorkspaceFileNode, CodeWorkspaceFolder, CodeWorkspaceNode, CodeWorkspaceSource } from './code-types.js'
  import { tick, untrack } from 'svelte'
  import { SvelteMap, SvelteSet } from 'svelte/reactivity'
  import { uiM } from '../../../messages.js'
  import Badge from '../../primitives/Badge.svelte'
  import Button from '../../primitives/Button.svelte'
  import Spinner from '../../primitives/Spinner.svelte'

  /**
   * 文件树的内部加载、选中及打开回调。
   *
   * @example 模块内部上下文
   * ```ts
   * const props: Props = {
   *   source: { listChildren: () => [], readFile: () => ({ text: '' }) },
   *   onopen: node => node.id,
   * }
   * ```
   */
  interface Props {
    source: CodeWorkspaceSource
    activeId?: string
    locale?: string
    reveal?: { ancestors: readonly CodeWorkspaceFolder[], focus?: boolean, request: number }
    onopen: (node: CodeWorkspaceFileNode, ancestors: readonly CodeWorkspaceFolder[]) => void
  }

  /**
   * 可见树节点及其目录链，用于键盘导航。
   *
   * @example 模块内部上下文
   * ```ts
   * const rootFile: TreeEntry = { node: { kind: 'file', id: 'readme', name: 'README.md' }, ancestors: [] }
   * ```
   */
  interface TreeEntry {
    node: CodeWorkspaceNode
    ancestors: readonly CodeWorkspaceFolder[]
  }

  /**
   * 树缓存的父级键，根节点使用 null。
   *
   * @example 模块内部上下文
   * ```ts
   * const root: ParentId = null
   * ```
   */
  type ParentId = string | null

  const { source, activeId, locale, reveal, onopen }: Props = $props()
  const instanceId = $props.id()
  const children = new SvelteMap<ParentId, readonly CodeWorkspaceNode[]>()
  const expanded = new SvelteSet<string>()
  const pending = new SvelteSet<ParentId>()
  const failed = new SvelteSet<ParentId>()
  const requests = new SvelteMap<ParentId, { controller: AbortController, promise: Promise<boolean> }>()
  const elements = new SvelteMap<string, HTMLLIElement>()
  let focusedId = $state<string>()
  let announcement = $state<{ key: 'code_treeFolderLoading' | 'code_treeFolderFailed' | 'code_treeFolderReady', name: string }>()
  let focusChanges = 0

  function listVisible(parent: ParentId, ancestors: readonly CodeWorkspaceFolder[], output: TreeEntry[]) {
    for (const node of children.get(parent) ?? []) {
      output.push({ node, ancestors })
      if (node.kind === 'folder' && expanded.has(node.id))
        listVisible(node.id, [...ancestors, node], output)
    }
  }

  const visible = $derived.by(() => {
    const entries: TreeEntry[] = []
    listVisible(null, [], entries)
    return entries
  })
  const tabStop = $derived(visible.some(entry => entry.node.id === focusedId)
    ? focusedId
    : visible.find(entry => entry.node.id === activeId)?.node.id ?? visible[0]?.node.id)

  $effect(() => {
    const current = source
    untrack(() => {
      children.clear()
      expanded.clear()
      pending.clear()
      failed.clear()
      focusedId = undefined
      announcement = undefined
      void loadChildren(null, current)
    })

    return () => {
      for (const { controller } of requests.values())
        controller.abort()
      requests.clear()
    }
  })

  $effect(() => {
    const current = source
    const target = reveal
    if (!target)
      return

    const controller = new AbortController()
    untrack(() => {
      void revealFolders(target, current, controller.signal)
    })
    return () => controller.abort()
  })

  function loadChildren(parent: CodeWorkspaceFolder | null, current = source): Promise<boolean> {
    const id = parent?.id ?? null
    const request = requests.get(id)
    if (request)
      return request.promise
    if (children.has(id))
      return Promise.resolve(true)

    const controller = new AbortController()
    const { signal } = controller
    const promise = Promise.resolve().then(async () => {
      try {
        if (signal.aborted || current !== source)
          return false
        const entries = await current.listChildren(parent, signal)
        if (signal.aborted || current !== source)
          return false
        children.set(id, entries)
        if (parent && expanded.has(parent.id))
          announcement = { key: 'code_treeFolderReady', name: parent.name }
        return true
      }
      catch {
        if (signal.aborted || current !== source)
          return false
        failed.add(id)
        if (parent && expanded.has(parent.id))
          announcement = { key: 'code_treeFolderFailed', name: parent.name }
        return false
      }
      finally {
        if (requests.get(id)?.controller === controller) {
          requests.delete(id)
          pending.delete(id)
        }
      }
    })

    requests.set(id, { controller, promise })
    pending.add(id)
    failed.delete(id)
    if (parent)
      announcement = { key: 'code_treeFolderLoading', name: parent.name }
    return promise
  }

  async function revealFolders(target: NonNullable<Props['reveal']>, current: CodeWorkspaceSource, signal: AbortSignal) {
    const startElement = document.activeElement
    const startFocusChanges = focusChanges
    const ready = await loadChildren(null, current)
    if (!ready || signal.aborted)
      return

    let parentId: ParentId = null
    for (const ancestor of target.ancestors) {
      const folder: CodeWorkspaceNode | undefined = children.get(parentId)?.find(node => node.id === ancestor.id && node.kind === 'folder')
      if (signal.aborted || folder?.kind !== 'folder')
        return
      expanded.add(folder.id)
      const loaded = await loadChildren(folder, current)
      if (!loaded || !expanded.has(folder.id))
        return
      parentId = folder.id
    }

    const targetId = parentId ?? children.get(null)?.[0]?.id
    if (target.focus && targetId !== undefined) {
      await tick()
      if (!signal.aborted && focusChanges === startFocusChanges && document.activeElement === startElement)
        focusNode(targetId)
    }
  }

  function register(node: HTMLLIElement, id: string) {
    elements.set(id, node)
    return {
      destroy() {
        if (elements.get(id) === node)
          elements.delete(id)
      },
    }
  }

  function focusNode(id: string | undefined) {
    if (id !== undefined)
      elements.get(id)?.focus()
  }

  function activate(node: CodeWorkspaceNode, ancestors: readonly CodeWorkspaceFolder[]) {
    if (node.kind === 'file') {
      onopen(node, ancestors)
      return
    }

    if (expanded.has(node.id) && !failed.has(node.id)) {
      expanded.delete(node.id)
      return
    }

    expanded.add(node.id)
    void loadChildren(node)
  }

  function handleClick(event: MouseEvent, node: CodeWorkspaceNode, ancestors: readonly CodeWorkspaceFolder[]) {
    if (!(event.target instanceof Element) || event.target.closest('[role="treeitem"]') !== event.currentTarget || event.detail > 1)
      return

    focusNode(node.id)
    activate(node, ancestors)
  }

  function handleKey(event: KeyboardEvent, node: CodeWorkspaceNode, ancestors: readonly CodeWorkspaceFolder[]) {
    if (event.currentTarget !== event.target || event.altKey || event.ctrlKey || event.metaKey)
      return

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        const index = visible.findIndex(entry => entry.node.id === node.id)
        const offset = event.key === 'ArrowUp'
          ? -1
          : 1
        focusNode(visible[index + offset]?.node.id)
        break
      }
      case 'Home':
        focusNode(visible[0]?.node.id)
        break
      case 'End':
        focusNode(visible.at(-1)?.node.id)
        break
      case 'ArrowLeft':
        if (node.kind === 'folder' && expanded.has(node.id))
          expanded.delete(node.id)
        else
          focusNode(ancestors.at(-1)?.id)
        break
      case 'ArrowRight':
        if (node.kind === 'folder') {
          if (!expanded.has(node.id) || failed.has(node.id)) {
            expanded.add(node.id)
            void loadChildren(node)
          }
          else if (!pending.has(node.id)) {
            focusNode(children.get(node.id)?.[0]?.id)
          }
        }
        break
      case 'Enter':
      case ' ':
        if (!event.repeat)
          activate(node, ancestors)
        break
      default:
        return
    }
    event.preventDefault()
  }

  function handleFocus(event: FocusEvent, nodeId: string) {
    if (event.target !== event.currentTarget)
      return
    focusChanges++
    focusedId = nodeId
  }

  async function retryRoot() {
    const trigger = document.activeElement
    const ready = await loadChildren(null)
    if (!ready)
      return
    await tick()
    if (document.activeElement === trigger || document.activeElement === document.body)
      focusNode(tabStop)
  }
</script>

{#snippet branch(entries: readonly CodeWorkspaceNode[], ancestors: readonly CodeWorkspaceFolder[])}
  {#each entries as node (node.id)}
    {@const folder = node.kind === 'folder'}
    {@const open = folder && expanded.has(node.id)}
    {@const busy = pending.has(node.id)}
    {@const error = failed.has(node.id)}
    {@const nodeChildren = children.get(node.id)}
    {@const statusId = `${instanceId}-${encodeURIComponent(node.id)}`}
    <li
      role='treeitem'
      use:register={node.id}
      data-code-node={node.id}
      class='hai-code-tree__item'
      tabindex={node.id === tabStop
        ? 0
        : -1}
      aria-label={[
        node.name,
        ...(node.markers?.map(marker => marker.label) ?? []),
      ].join(', ')}
      aria-current={!folder && activeId === node.id
        ? 'true'
        : undefined}
      aria-selected={folder
        ? undefined
        : activeId === node.id}
      aria-expanded={folder ? open : undefined}
      aria-busy={busy || undefined}
      aria-describedby={open && (busy || error || nodeChildren?.length === 0)
        ? statusId
        : undefined}
      onfocus={event => handleFocus(event, node.id)}
      onclick={event => handleClick(event, node, ancestors)}
      onkeydown={event => handleKey(event, node, ancestors)}
    >
      <div class='hai-code-tree__row' style:--depth={ancestors.length}>
        {#if folder}
          <svg data-code-chevron aria-hidden='true' class:hai-code-tree__chevron-open={open} viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>
            <path d='m6 4 4 4-4 4' />
          </svg>
          <svg data-code-folder aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>
            {#if open}
              <path d='M3 19.5V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v2M3 19.5l2.6-8A2 2 0 0 1 7.5 10H21a1 1 0 0 1 1 1.3l-2.5 7.4a2 2 0 0 1-1.9 1.3H3Z' />
            {:else}
              <path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' />
            {/if}
          </svg>
        {:else}
          <span class='hai-code-tree__spacer' aria-hidden='true'></span>
          <svg data-code-file aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>
            <path d='M6 3h8l4 4v14H6zM14 3v5h4M9 14l-1.5 1.5L9 17m6-3 1.5 1.5L15 17' />
          </svg>
        {/if}
        <span class='hai-code-tree__name' title={node.name}>{node.name}</span>
        {#if node.markers?.length}
          <span class='hai-code-tree__markers' aria-hidden='true'>
            {#each node.markers as marker, index (index)}
              <span title={marker.label}>
                <Badge variant={marker.tone === 'neutral'
                  ? 'default'
                  : marker.tone} size='xs'>
                  {marker.text ?? '●'}
                </Badge>
              </span>
            {/each}
          </span>
        {/if}
      </div>
      {#if open && node.kind === 'folder'}
        <ul role='group'>
          {#if nodeChildren?.length}
            {@render branch(nodeChildren, [...ancestors, node])}
          {:else}
            <li id={statusId} role='none' class='hai-code-tree__status' style:--depth={ancestors.length + 1}>
              {#if busy}
                <Spinner size='xs' variant='ghost' />
                <span>{uiM('code_treeLoading', undefined, locale)}</span>
              {:else if error}
                <span class='text-error'>{uiM('code_treeFolderFailed', { name: node.name }, locale)}</span>
                <span class='hai-code-tree__retry'>{uiM('code_retry', undefined, locale)}</span>
              {:else if nodeChildren}
                <span>{uiM('code_treeEmpty', undefined, locale)}</span>
              {/if}
            </li>
          {/if}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<div class='hai-code-tree'>
  <div role='status' aria-live='polite' aria-atomic='true' class='sr-only'>
    {#if announcement}{uiM(announcement.key, { name: announcement.name }, locale)}{/if}
  </div>

  {#if failed.has(null)}
    <div class='hai-code-tree__root-status'>
      <span class='text-error'>{uiM('code_treeFailed', undefined, locale)}</span>
      <Button variant='ghost' size='xs' onclick={retryRoot}>{uiM('code_retry', undefined, locale)}</Button>
    </div>
  {:else if children.get(null)?.length === 0}
    <div role='status' class='hai-code-tree__root-status'>{uiM('code_treeEmpty', undefined, locale)}</div>
  {:else if !children.has(null)}
    <div role='status' class='hai-code-tree__root-status'>
      <Spinner size='xs' variant='ghost' />
      <span>{uiM('code_treeLoading', undefined, locale)}</span>
    </div>
  {:else}
    <ul role='tree' aria-label={uiM('code_tree', undefined, locale)}>
      {@render branch(children.get(null) ?? [], [])}
    </ul>
  {/if}
</div>

<style>
  .hai-code-tree {
    min-inline-size: 0;
    padding-inline: .25rem;
    color: var(--color-base-content);
    font-size: .8125rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hai-code-tree__item {
    list-style: none;
  }

  .hai-code-tree__item:focus {
    outline: none;
  }

  .hai-code-tree__item:focus-visible > .hai-code-tree__row {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  .hai-code-tree__row {
    display: flex;
    min-inline-size: 0;
    min-block-size: 1.875rem;
    align-items: center;
    gap: .375rem;
    padding-block: .125rem;
    padding-inline: calc(.25rem + min(var(--depth, 0), 12) * .6875rem) .375rem;
    border-radius: .25rem;
    cursor: pointer;
  }

  .hai-code-tree__row:hover {
    background-color: color-mix(in oklab, var(--color-base-content) 7%, transparent);
  }

  .hai-code-tree__item[aria-current='true'] > .hai-code-tree__row {
    background-color: color-mix(in oklab, var(--color-primary) 18%, var(--color-base-100));
  }

  .hai-code-tree__row svg,
  .hai-code-tree__spacer {
    inline-size: .9375rem;
    block-size: .9375rem;
    flex: none;
  }

  .hai-code-tree__row svg[data-code-chevron],
  .hai-code-tree__spacer {
    inline-size: .75rem;
    color: color-mix(in oklab, var(--color-base-content) 75%, transparent);
  }

  .hai-code-tree__chevron-open {
    transform: rotate(90deg);
  }

  svg[data-code-folder] {
    color: color-mix(in oklab, var(--color-warning) 53%, var(--color-base-content));
  }

  svg[data-code-file] {
    color: color-mix(in oklab, var(--color-info) 55%, var(--color-base-content));
  }

  .hai-code-tree__name {
    flex: 1 1 auto;
    min-inline-size: 1ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hai-code-tree__markers {
    display: flex;
    flex: 0 1 auto;
    min-inline-size: 0;
    gap: .25rem;
    max-inline-size: 55%;
    overflow: hidden;
    white-space: nowrap;
  }

  .hai-code-tree__status,
  .hai-code-tree__root-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .375rem;
    padding: .25rem .375rem;
    overflow-wrap: anywhere;
  }

  .hai-code-tree__status {
    padding-inline-start: calc(.875rem + min(var(--depth, 0), 12) * .6875rem);
  }

  .hai-code-tree__retry {
    text-decoration: underline;
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .hai-code-tree__row {
      min-block-size: 2.75rem;
    }
  }
</style>
