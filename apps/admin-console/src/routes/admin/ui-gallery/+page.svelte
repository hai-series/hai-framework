<!--
  UI Gallery 首页 - 自动重定向至 primitives 标签页
-->
<script lang='ts'>
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { onMount } from 'svelte'

  const uiGalleryPrimitivesPath = resolve('/admin/ui-gallery/primitives', {})

  onMount(() => {
    void goto(uiGalleryPrimitivesPath, { replaceState: true })
  })
</script>
