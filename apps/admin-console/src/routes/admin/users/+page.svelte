<!--
  =============================================================================
  hai Admin Console - 用户列表页面（旧版，重定向到 /admin/iam/users）
  =============================================================================
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  
  // 重定向到新的用户管理页面
  onMount(() => {
    goto('/admin/iam/users', { replaceState: true })
  })
</script>

<svelte:head>
  <title>用户管理 - hai Admin</title>
</svelte:head>

<div class="flex items-center justify-center h-64">
  <div class="text-center">
    <span class="loading loading-spinner loading-lg text-primary"></span>
    <p class="mt-4 text-base-content/60">正在跳转...</p>
  </div>
</div>
