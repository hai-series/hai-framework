<script lang="ts">
  /**
   * 企业官网根布局
   */
  import { browser } from '$app/environment'
  import { getLocale, setLocale } from '$lib/paraglide/runtime.js'
  import * as m from '$lib/paraglide/messages.js'
  import {
    LanguageSwitch,
    ThemeSelector,
    applyTheme,
    getSavedTheme,
    setGlobalLocale,
  } from '@h-ai/ui'
  import type { Snippet } from 'svelte'
  import '../app.css'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()

  let currentTheme = $state('corporate')
  let currentLocale = $state<'zh-CN' | 'en-US'>('zh-CN')

  const navItems = $derived([
    { href: '/', label: m.nav_home() },
    { href: '/about', label: m.nav_about() },
    { href: '/services', label: m.nav_services() },
    { href: '/news', label: m.nav_news() },
    { href: '/contact', label: m.nav_contact() },
    { href: '/partners', label: m.nav_partner() },
  ])

  function handleLanguageChange(lang: string) {
    if (lang !== 'zh-CN' && lang !== 'en-US') {
      return
    }

    currentLocale = lang
    setGlobalLocale(lang)
    setLocale(lang)
  }

  function handleThemeChange(theme: string) {
    currentTheme = theme
    applyTheme(theme)
  }

  $effect(() => {
    if (!browser) {
      return
    }

    const savedLocale = getLocale()
    const savedTheme = getSavedTheme()

    currentLocale = savedLocale as 'zh-CN' | 'en-US'
    currentTheme = savedTheme

    setGlobalLocale(savedLocale)
    applyTheme(savedTheme, false)
  })
</script>

<div class="min-h-screen flex flex-col">
  <header class="sticky top-0 z-50 border-b border-base-200/80 bg-base-100/90 backdrop-blur">
    <div class="navbar mx-auto max-w-7xl px-4 lg:px-8">
      <div class="flex-1">
        <a href="/" class="text-lg lg:text-xl font-semibold tracking-wide">
          {m.brand()}
        </a>
      </div>

      <nav class="hidden lg:flex">
        <ul class="menu menu-horizontal px-1">
          {#each navItems as item}
            <li><a href={item.href}>{item.label}</a></li>
          {/each}
        </ul>
      </nav>

      <div class="flex items-center gap-2">
        <ThemeSelector
          currentTheme={currentTheme}
          onchange={handleThemeChange}
          showPreview={false}
          grouped
          class="hidden md:block"
        />

        <LanguageSwitch
          currentLanguage={currentLocale}
          onchange={handleLanguageChange}
          class="hidden sm:block"
        />

        <a href="/partners/admin/login" class="btn btn-sm btn-outline hidden md:inline-flex">
          {m.nav_partner_admin()}
        </a>

        <div class="dropdown dropdown-end lg:hidden">
          <button type="button" class="btn btn-ghost btn-square" aria-label={m.layout_menu()}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-5 h-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          <ul class="menu menu-sm dropdown-content bg-base-100 rounded-box z-10 mt-3 w-64 p-2 shadow border border-base-200">
            {#each navItems as item}
              <li><a href={item.href}>{item.label}</a></li>
            {/each}
            <li><a href="/partners/admin/login">{m.nav_partner_admin()}</a></li>
            <li class="mt-1 px-3 py-2 text-xs text-base-content/50">{m.layout_theme()}</li>
            <li class="px-3"><ThemeSelector currentTheme={currentTheme} onchange={handleThemeChange} showPreview={false} grouped /></li>
            <li class="mt-1 px-3 py-2 text-xs text-base-content/50">{m.layout_language()}</li>
            <li class="px-3"><LanguageSwitch currentLanguage={currentLocale} onchange={handleLanguageChange} /></li>
          </ul>
        </div>
      </div>
    </div>
  </header>

  <main class="flex-1 bg-base-100">
    {@render children()}
  </main>

  <footer class="bg-neutral text-neutral-content">
    <div class="footer md:footer-horizontal mx-auto max-w-7xl p-10 md:justify-between gap-8">
      <nav class="gap-2">
        <h6 class="footer-title">{m.footer_about()}</h6>
        <a href="/about" class="link link-hover">{m.nav_about()}</a>
        <a href="/news" class="link link-hover">{m.nav_news()}</a>
      </nav>
      <nav class="gap-2">
        <h6 class="footer-title">{m.footer_services()}</h6>
        <a href="/services" class="link link-hover">{m.nav_services()}</a>
        <a href="/partners" class="link link-hover">{m.nav_partner()}</a>
      </nav>
      <nav class="gap-2">
        <h6 class="footer-title">{m.footer_contact()}</h6>
        <a href="/contact" class="link link-hover">{m.nav_contact()}</a>
        <a href="/partners/admin/login" class="link link-hover">{m.nav_partner_admin()}</a>
      </nav>
    </div>
    <div class="footer footer-center border-t border-neutral-content/10 p-4 bg-neutral-focus text-neutral-content">
      <p>{m.footer_copyright()} © {new Date().getFullYear()} {m.brand()}.</p>
    </div>
  </footer>
</div>
