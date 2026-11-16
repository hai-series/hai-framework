<script lang='ts'>
  import type { DocLocale } from '#lib/doc-links.js'
  import type { DocNode } from '#lib/docs-types.js'
  import { afterNavigate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { docChapter, docSlug, docTitle } from '#lib/doc-links.js'
  import * as m from '#lib/paraglide/messages.js'

  // Vite 配置固定 paths.relative=false，HTTP 前缀不会随 SSR 页面深度改变。
  const base = resolve('/').replace(/\/$/, '')

  const { nodes, locale }: { nodes: DocNode[], locale: DocLocale } = $props()
  const chapterElements: HTMLDetailsElement[] = []
  const current = $derived(docChapter(page.url.pathname, base)?.slug)
  function isCurrent(node: DocNode): boolean {
    return current === docSlug(node.path, 'zh-CN')
  }
  function containsCurrent(node: DocNode): boolean {
    return isCurrent(node) || (node.children ?? []).some(containsCurrent)
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
        <a class:doc-active={isCurrent(item)} class:doc-section={depth === 0} href={resolve('/docs/[...slug]', {
          slug: docSlug(item.path, locale),
        })} aria-current={isCurrent(item)
          ? 'page'
          : undefined}>{docTitle(item, locale)}</a>
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
        <summary>{docTitle(chapter, locale)}</summary>
        <a href={resolve('/docs/[...slug]', {
          slug: docSlug(chapter.path, locale),
        })} class:doc-active={isCurrent(chapter)} aria-current={isCurrent(chapter)
          ? 'page'
          : undefined}>{m.site_chapter_overview()}</a>
        {@render branch(chapter.children ?? [], 1)}
      </details>
    {/each}
  </div>
{/key}
