<script lang="ts">
  /**
   * API 服务根布局
   */
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

{@render children()}
