<script lang="ts">
  /**
   * H5 应用根布局 — 移动端底部 Tab 导航
   */
  import '../app.css'
  import { page } from '$app/stores'

  interface Props {
    children: import('svelte').Snippet
  }

  let { children }: Props = $props()

  const tabs = [
    { href: '/', label: '首页', icon: '🏠' },
    { href: '/discover', label: '发现', icon: '🔍' },
    { href: '/cart', label: '购物车', icon: '🛒' },
    { href: '/profile', label: '我的', icon: '👤' },
  ]

  /** 认证页面不显示底部导航 */
  const isAuthPage = $derived($page.url.pathname.startsWith('/auth'))
</script>

{#if isAuthPage}
  {@render children()}
{:else}
  <div class="flex flex-col h-screen max-w-lg mx-auto bg-base-100">
    <main class="flex-1 overflow-y-auto pb-16">
      {@render children()}
    </main>

    <nav class="btm-nav btm-nav-sm max-w-lg mx-auto">
      {#each tabs as tab}
        <a href={tab.href} class:active={$page.url.pathname === tab.href}>
          <span class="text-lg">{tab.icon}</span>
          <span class="btm-nav-label text-xs">{tab.label}</span>
        </a>
      {/each}
    </nav>
  </div>
{/if}
