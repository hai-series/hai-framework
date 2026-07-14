<!--
  UI Gallery Layout - 标签导航 + 公共容器
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  /** UI Gallery 标签页配置列表，按 UI 顺序排列。 */
  const tabs = $derived([
    { key: 'primitives', label: m.gallery_tab_primitives() },
    { key: 'compounds', label: m.gallery_tab_compounds() },
    { key: 'scenes', label: m.gallery_tab_scenes() },
    { key: 'charts', label: m.gallery_tab_charts() },
    { key: 'overlays', label: m.gallery_tab_overlays() },
  ])

  /** 各标签页对应的路由路径，通过 SvelteKit resolve 生成。 */
  const primitivesPath = resolve('/admin/ui-gallery/primitives', {})
  const compoundsPath = resolve('/admin/ui-gallery/compounds', {})
  const scenesPath = resolve('/admin/ui-gallery/scenes', {})
  const chartsPath = resolve('/admin/ui-gallery/charts', {})
  const overlaysPath = resolve('/admin/ui-gallery/overlays', {})

  /** 从 URL 路径推断当前激活的标签 */
  const activeTab = $derived.by(() => {
    const pathname = page.url.pathname
    if (pathname.includes('/compounds'))
      return 'compounds'
    if (pathname.includes('/scenes'))
      return 'scenes'
    if (pathname.includes('/charts'))
      return 'charts'
    if (pathname.includes('/overlays'))
      return 'overlays'
    return 'primitives'
  })

  /** 标签页切换事件处理；根据 key 导航到对应路由。 */
  function handleTabChange(key: string) {
    if (key === 'compounds') {
      void goto(compoundsPath)
      return
    }

    if (key === 'scenes') {
      void goto(scenesPath)
      return
    }

    if (key === 'overlays') {
      void goto(overlaysPath)
      return
    }

    if (key === 'charts') {
      void goto(chartsPath)
      return
    }

    void goto(primitivesPath)
  }
</script>

<svelte:head>
  <title>{m.gallery_title()} - {m.app_title()}</title>
</svelte:head>

<ToastContainer />
<MessageContainer />
<MessageBoxContainer />

<div class='space-y-6'>
  <PageHeader title={m.gallery_title()} description={m.gallery_desc()} />
  <Tabs items={tabs} active={activeTab} type='card' onchange={handleTabChange} />
  {@render children()}
</div>
