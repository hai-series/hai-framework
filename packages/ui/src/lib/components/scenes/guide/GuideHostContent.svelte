<!--
  @component GuideHost
  GuideHost 组件的公开使用示例。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { GuideHost, createGuide } from '@h-ai/ui'
  const guide = createGuide({ tours: [], persistence: 'memory' })
  const host = mount(GuideHost, { target: document.body, props: { guide, locale: 'zh-CN', scope: 'demo' } })
  await unmount(host)
  guide.stop()
  ```
-->
<script lang='ts'>
  import type { GuideController } from '../../../guide-types.js'
  import type { DataAttributes } from '../../../types.js'
  import { onMount, untrack } from 'svelte'
  import { resolveGuideText } from '../../../guide.svelte.js'
  import { getUILocale, uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import { getDataAttributes } from '../../../utils.js'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import HelpCenter from './HelpCenter.svelte'
  import 'driver.js/dist/driver.css'
  import '../../../styles/guide.css'

  /**
   * 导览宿主属性；绑定应用语言、非敏感身份范围和控制器。
   *
   * @example
   * ```ts
   * import { mount, unmount } from 'svelte'
   * import { GuideHost, createGuide } from '@h-ai/ui'
   * const guide = createGuide({ tours: [], persistence: 'memory' })
   * const host = mount(GuideHost, { target: document.body, props: { guide, locale: 'zh-CN', scope: 'demo' } })
   * await unmount(host)
   * guide.stop()
   * ```
   */
  interface Props {
    guide: GuideController
    locale?: string
    /** 非敏感的用户标识，账号切换后独立记录引导偏好。 */
    scope?: string
    /** 挂载后提示首次使用者，不会直接打断操作或自动跳转。 */
    autoStart?: string
  }

  const { guide, locale = getUILocale(), scope = 'anonymous', autoStart, ...restProps }: Props & DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))
  let ready = $state(false)
  const offered = $derived.by(() => {
    void locale
    const tour = guide.offeredTour
    return tour ? { id: tour.id, title: resolveGuideText(tour.title), description: resolveGuideText(tour.description) } : null
  })
  const text = $derived.by(() => ({
    welcome: uiM('guide_welcome', undefined, locale),
    start: uiM('guide_start', undefined, locale),
    later: uiM('guide_later', undefined, locale),
    dismiss: uiM('guide_dismiss', undefined, locale),
    help: uiM('guide_help', undefined, locale),
    close: uiM('guide_close', undefined, locale),
    loading: uiM('guide_loading', undefined, locale),
  }))

  $effect(() => {
    const currentLocale = locale
    untrack(() => guide.setLocale(currentLocale))
  })
  $effect(() => {
    const currentScope = scope
    const tourId = autoStart
    if (ready) {
      untrack(() => {
        guide.setScope(currentScope)
        if (tourId)
          guide.startIfNeeded(tourId)
      })
    }
  })
  $effect(() => {
    const pathname = guide.pathname
    untrack(() => guide.handleNavigation(pathname))
  })
  onMount(() => {
    let alive = true
    guide.setScope(scope)
    guide.setLocale(locale)
    void guide.resume().then(() => {
      if (alive)
        ready = true
    }).catch(() => {
      if (alive) {
        guide.stop()
        guide.closeHelp()
      }
    })
    return () => {
      alive = false
      guide.stop()
    }
  })
  useToastFeedback(() => guide.error, 'warning')
</script>

<div {...dataAttributes} class='contents'>

  {#if offered}
    <aside class='hai-guide-offer fixed bottom-4 right-4 z-[1150] w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-base-content/10 bg-base-100 p-5 text-base-content shadow-(--shadow-overlay)' aria-label={text.welcome} data-testid='guide-offer'>
      <p class='text-xs font-medium text-primary'>{text.welcome}</p>
      <h2 class='mt-2 text-base font-semibold'>{offered.title}</h2>
      <p class='mt-2 text-sm leading-6 text-base-content/65'>{offered.description}</p>
      <div class='mt-4 flex flex-wrap gap-2'>
        <Button variant='primary' size='sm' onclick={() => offered && void guide.start(offered.id)} data-testid='guide-start'>{text.start}</Button>
        <Button variant='ghost' size='sm' onclick={() => guide.defer()} data-testid='guide-later'>{text.later}</Button>
        <Button variant='ghost' size='sm' onclick={() => guide.dismiss()} data-testid='guide-dismiss'>{text.dismiss}</Button>
      </div>
    </aside>
  {/if}

  {#if guide.busy}
    <div class='hai-guide-loading fixed bottom-4 left-1/2 z-[1000000001] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-base-content/10 bg-base-100 px-4 py-2 text-sm text-base-content shadow-lg' role='status' data-testid='guide-loading'>
      <span class='loading loading-spinner loading-xs'></span>{text.loading}
      <Button size='sm' variant='ghost' onclick={() => guide.stop()} data-testid='guide-cancel'>{text.close}</Button>
    </div>
  {/if}

  {#if guide.helpOpen}
    <Modal open title={text.help} size='4xl' height='min(80dvh, 48rem)' bodyClass='p-0' onclose={() => guide.closeHelp()} data-testid='guide-help'>
      <HelpCenter articles={guide.articles} tours={guide.tours} selectedId={guide.articleId} {locale} onstart={id => void guide.start(id)} />
    </Modal>
  {/if}
</div>
