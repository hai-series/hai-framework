<script module lang='ts'>
  import { browser } from '$app/env'
  import { resolve } from '$app/paths'
  import { docChapter, docLocaleStrategy } from '#lib/doc-links.js'
  import { defineCustomClientStrategy } from '#lib/paraglide/runtime.js'

  // Vite 配置固定 paths.relative=false，HTTP 前缀不会随 SSR 页面深度改变。
  const base = resolve('/').replace(/\/$/, '')
  if (browser) {
    defineCustomClientStrategy(docLocaleStrategy, {
      getLocale: () => docChapter(window.location.pathname, base)?.locale,
      // 文档语言由 URL 决定，其他页面继续使用 Paraglide 的 cookie 策略。
      setLocale: () => {},
    })
  }
</script>

<script lang='ts'>
  import type { DocLocale } from '#lib/doc-links.js'
  import type { LayoutProps } from './$types'
  import { afterNavigate, goto, preloadData } from '$app/navigation'
  import { page } from '$app/state'
  import { LanguageSwitch, setGlobalLocale, ThemeSelector, ToastContainer } from '@h-ai/ui'
  import { applyTheme, getCurrentTheme, getThemeInfo } from '@h-ai/ui/theme'
  import { onMount } from 'svelte'
  import SearchDialog from '#lib/components/SearchDialog.svelte'
  import { localizedDocSlug } from '#lib/doc-links.js'
  import * as m from '#lib/paraglide/messages.js'
  import { getLocale, setLocale } from '#lib/paraglide/runtime.js'

  import '../app.css'

  const { children, data }: LayoutProps = $props()
  const themeIds = ['light', 'dark', 'liquid-glass']
  let locale = $state(getLocale())
  let theme = $state('light')
  let searchOpen = $state(false)
  let interactive = $state(false)

  function applyLanguage(next: DocLocale) {
    if (locale !== next)
      searchOpen = false
    locale = next
    setGlobalLocale(next)
    document.documentElement.lang = next
  }

  async function changeLanguage(language: string) {
    const next = language === 'en-US' || language === 'ja-JP'
      ? language
      : 'zh-CN'
    if (next === locale)
      return
    const chapter = docChapter(page.url.pathname, base)
    if (chapter) {
      const { hash, search } = page.url
      const params = {
        slug: localizedDocSlug(chapter.slug, next),
      }
      const href = resolve('/docs/[...slug]', params)
      const target = hash
        ? await preloadData(`${href}${search}`)
        : undefined
      const sections: { id?: string }[] = target?.type === 'loaded'
        ? target.data.document?.sections ?? []
        : []
      const anchor = sections.some(section => section.id && `#${encodeURIComponent(section.id)}` === hash)
        ? hash
        : ''
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- 路径已由 resolve 生成，随后附上查询参数与锚点。
      await goto(`${href}${search}${anchor}`)
    }
    setLocale(next, { reload: false })
    applyLanguage(next)
  }
  function changeTheme(next: string) {
    theme = next
    applyTheme(next)
  }
  onMount(() => {
    theme = getCurrentTheme()
    applyTheme(theme, false)
    interactive = true
  })
  afterNavigate(() => applyLanguage(getLocale()))
  const docsActive = $derived(Boolean(docChapter(page.url.pathname, base)))
</script>

<svelte:head>
  <meta name='theme-color' content={getThemeInfo(theme)?.bgColor ?? '#ffffff'} />
</svelte:head>

{#key locale}
  <a class='skip-link' href='#main-content'>{m.site_skip()}</a>
  <header class='site-header'>
    <div class='header-inner'>
      <a class='brand' href={resolve('/')} aria-label='hai-framework'><span class='brand-mark' aria-hidden='true'>h</span><span>hai<span class='brand-light'>framework</span></span></a>
      <span class='version-tag'>{data.version}</span>
      <nav class='main-nav' aria-label={m.site_navigation()}>
        <a href={resolve('/')} aria-current={!docsActive
          ? 'page'
          : undefined}>{m.site_home()}</a>
        <a href={resolve('/docs/[...slug]', {
          slug: localizedDocSlug('getting-started/create', locale),
        })}>{m.site_quickstart()}</a>
        <a href={resolve('/docs/[...slug]', {
          slug: localizedDocSlug('', locale),
        })} aria-current={docsActive ? 'page' : undefined}>{m.site_docs()}</a>
        <a href='https://github.com/hai-series/hai-framework' target='_blank' rel='noopener noreferrer'>GitHub <span aria-hidden='true'>↗</span></a>
      </nav>
      <div class='header-actions' inert={!interactive}>
        <button class='search-trigger' type='button' onclick={() => { searchOpen = true }} aria-label={m.site_search_title()}><span class='icon-[tabler--search] size-4' aria-hidden='true'></span><span>{m.site_search_title()}</span></button>
        <LanguageSwitch currentLanguage={locale} onchange={changeLanguage} />
        <ThemeSelector currentTheme={theme} {themeIds} onchange={changeTheme} compact grouped={false} />
      </div>
    </div>
  </header>
  <main id='main-content' tabindex='-1' class:docs-main={docsActive}>
    {@render children()}
  </main>
  <footer class='site-footer'>
    <div><a class='brand' href={resolve('/')}>hai<span class='brand-light'>framework</span></a><p>{m.site_footer()}</p></div>
    <nav aria-label={m.site_resources()}><a href={resolve('/docs/[...slug]', { slug: '' })} lang='zh-CN'>简体中文</a><a href={resolve('/docs/[...slug]', { slug: 'en' })} lang='en-US'>English</a><a href={resolve('/docs/[...slug]', { slug: 'ja' })} lang='ja-JP'>日本語</a><a href='https://github.com/hai-series/hai-framework/blob/main/LICENSE'>Apache-2.0</a></nav>
  </footer>
  {#if browser}<SearchDialog bind:open={searchOpen} {locale} />{/if}
  <ToastContainer />
{/key}
