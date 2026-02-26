<!--
  UI Gallery 首页 - 自动重定向至 primitives 标签页
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'

  onMount(() => {
    goto('/admin/ui-gallery/primitives', { replaceState: true })
  })
</script>
