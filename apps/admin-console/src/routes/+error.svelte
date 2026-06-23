<!--
  Admin Console - 全局错误页
  使用 @h-ai/ui 的 ErrorPage 场景组件展示 HTTP 错误
-->
<script lang='ts'>
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'

  const homeUrl = resolve('/admin', {})
</script>

<svelte:head>
  <title>{page.status} · Admin Console</title>
</svelte:head>

<div class='min-h-screen bg-base-200/30'>
  <ErrorPage
    status={page.status}
    onhome={() => goto(homeUrl)}
  />
</div>
