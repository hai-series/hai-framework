<script lang="ts">
  /**
   * 新闻动态页面
   */
  import { Badge, Button } from '@h-ai/ui'
  import * as m from '$lib/paraglide/messages.js'

  const tagVariantMap: Record<string, 'primary' | 'secondary' | 'success' | 'info'> = {
    award: 'primary',
    product: 'info',
    partnership: 'success',
    event: 'secondary',
  }

  const articles = $derived([
    {
      title: m.news_article_1_title(),
      date: '2025-01-15',
      summary: m.news_article_1_summary(),
      tag: m.news_tag_award(),
      tagKey: 'award',
    },
    {
      title: m.news_article_2_title(),
      date: '2025-01-10',
      summary: m.news_article_2_summary(),
      tag: m.news_tag_product(),
      tagKey: 'product',
    },
    {
      title: m.news_article_3_title(),
      date: '2024-12-20',
      summary: m.news_article_3_summary(),
      tag: m.news_tag_partnership(),
      tagKey: 'partnership',
    },
    {
      title: m.news_article_4_title(),
      date: '2024-12-05',
      summary: m.news_article_4_summary(),
      tag: m.news_tag_event(),
      tagKey: 'event',
    },
  ])
</script>

<svelte:head>
  <title>{m.news_page_title()} - {m.brand()}</title>
  <meta name="description" content={m.news_page_description()} />
</svelte:head>

<section class="py-20 px-4 lg:px-8">
  <div class="max-w-4xl mx-auto">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold tracking-tight text-base-content">{m.news_page_title()}</h1>
      <p class="text-base-content/50 mt-2">{m.news_page_subtitle()}</p>
    </div>

    <div class="space-y-4">
      {#each articles as article}
        <Card shadow="sm" class="hover:-translate-y-0.5 hover:shadow-(--shadow-soft) transition-all duration-200">
          <div class="flex items-start gap-3 mb-2">
            <Badge variant={tagVariantMap[article.tagKey] ?? 'primary'} size="sm">{article.tag}</Badge>
            <time class="text-xs text-base-content/40 tabular-nums">{article.date}</time>
          </div>
          <h2 class="text-base font-semibold text-base-content mb-1">{article.title}</h2>
          <p class="text-sm text-base-content/60 leading-relaxed">{article.summary}</p>
          <div class="mt-3">
            <Button variant="ghost" size="sm">{m.news_read_more()}</Button>
          </div>
        </Card>
      {/each}
    </div>
  </div>
</section>
