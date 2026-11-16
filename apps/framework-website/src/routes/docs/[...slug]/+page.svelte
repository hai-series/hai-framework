<script lang='ts'>
  import type { PageProps } from './$types'
  import { afterNavigate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { MarkdownRenderer } from '@h-ai/ui'
  import DocTree from '#lib/components/DocTree.svelte'
  import { docSlug } from '#lib/doc-links.js'
  import * as m from '#lib/paraglide/messages.js'

  const { data }: PageProps = $props()
  const hasScreenshots = $derived(data.document.sections.some(section => section.html.includes('<img ')))
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
  <aside class='documentation-sidebar'><nav aria-label={m.site_doc_navigation()}><p class='sidebar-label'>{m.site_docs()}</p><DocTree nodes={data.navigation.sections} locale={data.document.locale} /></nav></aside>
  <div class='document-column'>
    <details bind:this={mobileNavigation} class='mobile-doc-navigation'><summary>{m.site_doc_navigation()}</summary><nav aria-label={m.site_doc_navigation()}><DocTree nodes={data.navigation.sections} locale={data.document.locale} /></nav></details>
    <div class='document-meta'><a href={data.document.sourceUrl} target='_blank' rel='external noopener noreferrer'>{m.site_edit_page()} ↗</a></div>
    {#if data.document.locale !== data.document.sourceLocale || data.document.partialTranslation}
      <p class='document-translation-note'>
        {data.document.partialTranslation
          ? m.site_translation_partial()
          : m.site_translation_missing()}
        <a href={resolve('/docs/[...slug]', {
          slug: docSlug(data.document.file, 'zh-CN'),
        })}>{m.site_translation_original()}</a>
      </p>
    {/if}
    {#if hasScreenshots}<p class='document-image-hint'>{m.site_screenshot_hint()}</p>{/if}
    <article class='documentation-content' lang={data.document.sourceLocale}>
      {#each data.document.sections as section, index (index)}
        <section id={section.id}>
          <MarkdownRenderer content={section.html} allowHtmlTags />
        </section>
      {/each}
    </article>
    <p class='document-end'>{m.site_docs_feedback()} <a href='https://github.com/hai-series/hai-framework/issues' target='_blank' rel='noopener noreferrer'>GitHub Issues ↗</a></p>
  </div>
  <aside class='document-outline'><nav aria-label={m.site_on_this_page()}><p class='sidebar-label'>{m.site_on_this_page()}</p><ul lang={data.document.sourceLocale}>{#each data.document.headings as heading (heading.id)}<li class:heading-child={heading.depth === 3}><a href={`#${heading.id}`}>{heading.title}</a></li>{/each}</ul></nav></aside>
</div>
