<!--
  hai Admin Console - 根布局
  使用 TailwindCSS + DaisyUI 实现现代化 UI
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import '../app.css'
  
  interface Props {
    children: Snippet
  }
  
  let { children }: Props = $props()
</script>

<svelte:head>
  <meta name="theme-color" content="#570df8" />
  <meta name="description" content="hai Admin Console - 现代化管理后台" />
</svelte:head>

{@render children()}
