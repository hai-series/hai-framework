<!--
  @component HelpCenter
  HelpCenter 组件的公开使用示例。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { HelpCenter } from '@h-ai/ui'
  const props: ComponentProps<typeof HelpCenter> = { articles: [{ id: 'start', title: '开始使用', content: '# 操作说明' }] }
  const component = mount(HelpCenter, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { GuideArticle, GuideTour } from '../../../guide-types.js'
  import type { DataAttributes } from '../../../types.js'
  import { resolveGuideText } from '../../../guide.svelte.js'
  import { getUILocale, uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import { getDataAttributes } from '../../../utils.js'
  import BareButton from '../../primitives/BareButton.svelte'
  import Button from '../../primitives/Button.svelte'
  import Input from '../../primitives/Input.svelte'

  /**
   * HelpCenter 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import type { ComponentProps } from 'svelte'
   * import { HelpCenter } from '@h-ai/ui'
   * const props: ComponentProps<typeof HelpCenter> = { articles: [{ id: 'start', title: '开始使用', content: '# 操作说明' }] }
   * const component = mount(HelpCenter, { target: document.body, props })
   * await unmount(component)
   * ```
   */
  interface Props {
    articles: readonly GuideArticle[]
    tours?: readonly GuideTour[]
    locale?: string
    selectedId?: string | null
    onstart?: (tourId: string) => void
  }
  const { articles, tours = [], locale = getUILocale(), selectedId = null, onstart, ...restProps }: Props & DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  let search = $state('')
  const searchId = $props.id()
  let currentId = $derived(selectedId)
  // 显式依赖宿主语言，确保回调返回的业务翻译也重新求值。
  const articleState = $derived.by(() => {
    void locale
    let failed = false
    const localized = articles.flatMap((article) => {
      try {
        if (article.enabled && !article.enabled())
          return []
        return [{ ...article, title: resolveGuideText(article.title), description: resolveGuideText(article.description), category: resolveGuideText(article.category), content: resolveGuideText(article.content) }]
      }
      catch {
        failed = true
        return []
      }
    })
    return { localized, failed }
  })
  const localized = $derived(articleState.localized)
  const availableTours = $derived.by(() => {
    void locale
    return tours.flatMap((tour) => {
      try {
        return !tour.enabled || tour.enabled() ? [{ id: tour.id, title: resolveGuideText(tour.title) }] : []
      }
      catch { return [] }
    })
  })
  const visible = $derived(localized.filter(article => (`${article.title} ${article.description} ${article.category} ${article.content}`).toLowerCase().includes(search.trim().toLowerCase())))
  const selected = $derived(visible.find(article => article.id === currentId) ?? visible[0])
  const markdown = $derived(selected ? import('../ai/MarkdownRenderer.svelte') : null)
  const text = $derived.by(() => ({
    search: uiM('guide_search', undefined, locale),
    empty: uiM('guide_empty', undefined, locale),
    tours: uiM('guide_tours', undefined, locale),
    start: uiM('guide_start', undefined, locale),
    loading: uiM('guide_loading', undefined, locale),
    failed: uiM('guide_startFailed', undefined, locale),
  }))
  useToastFeedback(() => articleState.failed ? text.failed : '', 'warning')
</script>

<div data-testid='help-center' {...dataAttributes} class='flex min-h-0 flex-col text-base-content md:flex-row'>
  <nav class='shrink-0 border-b border-base-content/8 p-4 md:w-64 md:border-b-0 md:border-r' aria-label={text.search}>
    <label class='sr-only' for={searchId}>{text.search}</label>
    <Input id={searchId} bind:value={search} placeholder={text.search} data-testid='guide-search' />
    <div class='mt-3 max-h-40 space-y-1 overflow-y-auto md:max-h-[50dvh]'>
      {#each visible as article (article.id)}
        <BareButton class={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-base-content/5 ${selected?.id === article.id ? 'bg-primary/10 font-semibold text-primary' : ''}`} onclick={() => currentId = article.id} data-testid={`guide-article-${article.id}`}>
          {#if article.category}<span class='mb-1 block text-xs text-base-content/50'>{article.category}</span>{/if}
          <span class='block'>{article.title}</span>
        </BareButton>
      {/each}
    </div>
    {#if onstart && availableTours.length}
      <p class='mt-5 text-xs font-medium text-base-content/50'>{text.tours}</p>
      <div class='mt-2 flex flex-wrap gap-2 md:flex-col'>
        {#each availableTours as tour (tour.id)}
          <Button variant='ghost' size='sm' onclick={() => onstart?.(tour.id)} data-testid={`guide-tour-${tour.id}`}>{tour.title}</Button>
        {/each}
      </div>
    {/if}
  </nav>
  <article class='min-w-0 flex-1 p-5 md:p-7' data-testid='guide-article-content'>
    {#if selected}
      <h2 class='text-xl font-semibold'>{selected.title}</h2>
      {#if selected.description}<p class='mt-2 text-sm text-base-content/60'>{selected.description}</p>{/if}
      {#if selected.tourId && availableTours.some(tour => tour.id === selected.tourId) && onstart}
        <Button variant='primary' size='sm' class='mt-4' onclick={() => onstart?.(selected!.tourId!)} data-testid='guide-article-start'>{text.start}</Button>
      {/if}
      <div class='mt-5'>
        {#await markdown}
          <p class='text-sm text-base-content/50' role='status'>{text.loading}</p>
        {:then component}
          {#if component}
            <component.default content={selected.content} allowHtmlTags={false} showCopyButton={false} />
          {/if}
        {:catch}
          <p class='text-sm text-base-content/60'>{text.failed}</p>
        {/await}
      </div>
    {:else}
      <p class='py-8 text-center text-sm text-base-content/50'>{text.empty}</p>
    {/if}
  </article>
</div>
