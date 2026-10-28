<script lang='ts'>
  import type { DocNode } from '$lib/docs-types.js'
  import { afterNavigate } from '$app/navigation'
  import { base, resolve } from '$app/paths'
  import { page } from '$app/state'
  import { docLink, docSlug } from '$lib/doc-links.js'
  import * as m from '$lib/paraglide/messages'

  const { nodes }: { nodes: DocNode[] } = $props()
  const chapterElements: HTMLDetailsElement[] = []
  function containsCurrent(node: DocNode): boolean {
    return page.url.pathname === docLink(node.path, base) || (node.children ?? []).some(containsCurrent)
  }
  const currentChapter = $derived(nodes.find(containsCurrent)?.id)
  afterNavigate(() => {
    // 搜索到同一章时也恢复当前章；只调整目录，不滚动主文或打断锚点。
    for (const [index, chapter] of nodes.entries()) {
      if (chapterElements[index])
        chapterElements[index].open = containsCurrent(chapter)
    }
  })
</script>

{#snippet branch(items: DocNode[], depth: number)}
  <ul class:doc-subtree={depth > 0}>
    {#each items as item (item.id)}
      <li>
        <a class:doc-active={page.url.pathname === docLink(item.path, base)} class:doc-section={depth === 0} href={resolve('/docs/[...slug]', { slug: docSlug(item.path) })} aria-current={page.url.pathname === docLink(item.path, base) ? 'page' : undefined}>{item.title}</a>
        {#if item.children?.length}
          {@render branch(item.children, depth + 1)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#key currentChapter}
  <div class='doc-chapters'>
    {#each nodes as chapter, index (chapter.id)}
      <details bind:this={chapterElements[index]} class='doc-chapter' class:doc-chapter-current={chapter.id === currentChapter} open={chapter.id === currentChapter} data-doc-section={chapter.id}>
        <summary>{chapter.title}</summary>
        <a href={resolve('/docs/[...slug]', { slug: docSlug(chapter.path) })} class:doc-active={page.url.pathname === docLink(chapter.path, base)} aria-current={page.url.pathname === docLink(chapter.path, base) ? 'page' : undefined}>{m.site_chapter_overview()}</a>
        {@render branch(chapter.children ?? [], 1)}
      </details>
    {/each}
  </div>
{/key}
