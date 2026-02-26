<!--
  UI Gallery Layout - 标签导航 + 公共容器
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import * as m from '$lib/paraglide/messages'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()

  const tabs = $derived([
    { key: 'primitives', label: m.gallery_tab_primitives() },
    { key: 'compounds', label: m.gallery_tab_compounds() },
    { key: 'scenes', label: m.gallery_tab_scenes() },
    { key: 'overlays', label: m.gallery_tab_overlays() },
  ])

  /** 从 URL 路径推断当前激活的标签 */
  const activeTab = $derived.by(() => {
    const pathname = page.url.pathname
    if (pathname.includes('/compounds')) return 'compounds'
    if (pathname.includes('/scenes')) return 'scenes'
    if (pathname.includes('/overlays')) return 'overlays'
    return 'primitives'
  })

  function handleTabChange(key: string) {
    goto(`/admin/ui-gallery/${key}`)
  }
</script>

<svelte:head>
  <title>{m.gallery_title()} - {m.app_title()}</title>
</svelte:head>

<ToastContainer />

<div class="space-y-6">
  <PageHeader title={m.gallery_title()} description={m.gallery_desc()} />
  <Tabs items={tabs} active={activeTab} type="card" onchange={handleTabChange} />
  {@render children()}
</div>
