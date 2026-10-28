<script lang='ts'>
  import type { LayoutProps } from './$types'
  import { browser } from '$app/environment'
  import { base, resolve } from '$app/paths'
  import { page } from '$app/state'
  import SearchDialog from '$lib/components/SearchDialog.svelte'
  import * as m from '$lib/paraglide/messages'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import { LanguageSwitch, setGlobalLocale, ThemeToggle, ToastContainer } from '@h-ai/ui'
  import { applyTheme, getSavedTheme } from '@h-ai/ui/theme'
  import { onMount } from 'svelte'
  import '../app.css'

  const { children, data }: LayoutProps = $props()
  let locale = $state('zh-CN')
  let theme = $state('light')
  let searchOpen = $state(false)
  let interactive = $state(false)

  function changeLanguage(language: string) {
    const next = language === 'en-US' || language === 'ja-JP' ? language : 'zh-CN'
    locale = next
    setLocale(next, { reload: false })
    setGlobalLocale(next)
    document.documentElement.lang = next
  }
  function changeTheme(next: string) {
    theme = next
    applyTheme(next)
  }
  onMount(() => {
    changeLanguage(getLocale())
    theme = getSavedTheme('light')
    applyTheme(theme)
    interactive = true
  })
  const docsActive = $derived(page.url.pathname.startsWith(`${base}/docs`))
</script>

<svelte:head>
  <meta name='theme-color' content={theme === 'dark' ? '#1d232a' : '#ffffff'} />
</svelte:head>

{#key locale}
  <a class='skip-link' href='#main-content'>{m.site_skip()}</a>
  <header class='site-header'>
    <div class='header-inner'>
      <a class='brand' href={resolve('/', {})} aria-label='hai-framework'><span class='brand-mark' aria-hidden='true'>h</span><span>hai<span class='brand-light'>framework</span></span></a>
      <span class='version-tag'>{data.version}</span>
      <nav class='main-nav' aria-label={m.site_navigation()}>
        <a href={resolve('/', {})} aria-current={!docsActive ? 'page' : undefined}>{m.site_home()}</a>
        <a href={resolve('/docs/[...slug]', { slug: 'getting-started/create' })}>{m.site_quickstart()}</a>
        <a href={resolve('/docs/[...slug]', { slug: '' })} aria-current={docsActive ? 'page' : undefined}>{m.site_docs()}</a>
        <a href='https://github.com/hai-series/hai-framework' target='_blank' rel='noopener noreferrer'>GitHub <span aria-hidden='true'>↗</span></a>
      </nav>
      <div class='header-actions' inert={!interactive}>
        <button class='search-trigger' type='button' onclick={() => { searchOpen = true }} aria-label={m.site_search_title()}><span class='icon-[tabler--search] size-4' aria-hidden='true'></span><span>{m.site_search_title()}</span></button>
        <LanguageSwitch currentLanguage={locale} onchange={changeLanguage} />
        <ThemeToggle currentTheme={theme} onchange={changeTheme} />
      </div>
    </div>
  </header>
  <main id='main-content' tabindex='-1' class:docs-main={docsActive}>
    {@render children()}
  </main>
  <footer class='site-footer'>
    <div><a class='brand' href={resolve('/', {})}>hai<span class='brand-light'>framework</span></a><p>{m.site_footer()}</p></div>
    <nav aria-label={m.site_resources()}><a href={resolve('/docs/[...slug]', { slug: 'README.en' })}>English guide</a><a href={resolve('/docs/[...slug]', { slug: 'README.ja' })}>日本語ガイド</a><a href='https://github.com/hai-series/hai-framework/blob/main/LICENSE'>Apache-2.0</a></nav>
  </footer>
  {#if browser}<SearchDialog bind:open={searchOpen} />{/if}
  <ToastContainer />
{/key}
