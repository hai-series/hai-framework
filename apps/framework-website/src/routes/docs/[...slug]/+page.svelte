<script lang='ts'>
  import type { PageProps } from './$types'
  import { afterNavigate } from '$app/navigation'
  import DocTree from '$lib/components/DocTree.svelte'
  import * as m from '$lib/paraglide/messages'
  import { MarkdownRenderer } from '@h-ai/ui'

  const { data }: PageProps = $props()
  let mobileNavigation: HTMLDetailsElement
  afterNavigate(() => {
    if (mobileNavigation)
      mobileNavigation.open = false
  })
</script>

<svelte:head>
  <title>{data.document.title} · hai-framework</title>
  <meta name='description' content={data.document.description} />
</svelte:head>

<div class='documentation-shell'>
  <aside class='documentation-sidebar'><nav aria-label={m.site_doc_navigation()}><p class='sidebar-label'>{m.site_docs()}</p><DocTree nodes={data.navigation.sections} /></nav></aside>
  <div class='document-column'>
    <details bind:this={mobileNavigation} class='mobile-doc-navigation'><summary>{m.site_doc_navigation()}</summary><nav aria-label={m.site_doc_navigation()}><DocTree nodes={data.navigation.sections} /></nav></details>
    <div class='document-meta'><span>{m.site_chinese_note()}</span><a href={`https://github.com/hai-series/hai-framework/blob/main/docs/usage/${data.document.file}`} target='_blank' rel='noopener noreferrer'>{m.site_edit_page()} ↗</a></div>
    <article class='documentation-content'>
      {#each data.document.sections as section, index (index)}
        <section id={section.id}>
          <MarkdownRenderer content={section.html} allowHtmlTags />
        </section>
      {/each}
    </article>
    <p class='document-end'>{m.site_docs_feedback()} <a href='https://github.com/hai-series/hai-framework/issues' target='_blank' rel='noopener noreferrer'>GitHub Issues ↗</a></p>
  </div>
  <aside class='document-outline'><nav aria-label={m.site_on_this_page()}><p class='sidebar-label'>{m.site_on_this_page()}</p><ul>{#each data.document.headings as heading (heading.id)}<li class:heading-child={heading.depth === 3}><a href={`#${heading.id}`}>{heading.title}</a></li>{/each}</ul></nav></aside>
</div>
