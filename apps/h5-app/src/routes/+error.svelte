<!--
  H5 应用 - 全局错误页
  使用 @h-ai/ui 的 ErrorPage 场景组件
-->
<script lang='ts'>
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { ErrorPage } from '@h-ai/ui'

  const homeUrl = resolve('/', {})
</script>

<svelte:head>
  <title>{page.status}</title>
</svelte:head>

<ErrorPage status={page.status} onhome={() => goto(homeUrl)} />
