<!--
  企业官网 - 全局错误页
  使用 @h-ai/ui 的 ErrorPage 场景组件
-->
<script lang='ts'>
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { ErrorPage } from '@h-ai/ui'

  const homeUrl = resolve('/', {})
</script>

<svelte:head>
  <title>{page.status}</title>
</svelte:head>

<div class='py-16'>
  <ErrorPage status={page.status} {homeUrl} showBack={false} />
</div>
