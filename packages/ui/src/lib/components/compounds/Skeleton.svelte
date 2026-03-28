<!--
  @component Skeleton
  骨架屏占位组件，用于加载状态展示。
-->
<script lang='ts'>
  import type { SkeletonProps } from '../../types.js'
  import { cn } from '../../utils.js'

  const {
    variant = 'text',
    width = '',
    height = '',
    circle = false,
    animation = true,
    count = 1,
    class: className = '',
  }: SkeletonProps = $props()

  const baseClass = $derived(
    cn(
      'skeleton',
      animation && 'animate-pulse',
      circle && 'rounded-full',
      variant === 'text' && 'h-4',
      variant === 'title' && 'h-6 w-3/4',
      variant === 'avatar' && 'w-10 h-10 rounded-full',
      variant === 'thumbnail' && 'w-24 h-24 rounded-lg',
      variant === 'button' && 'h-10 w-24 rounded-lg',
      variant === 'input' && 'h-10 w-full rounded-lg',
      className,
    ),
  )

  const style = $derived(
    [
      width && `width: ${width}`,
      height && `height: ${height}`,
    ].filter(Boolean).join('; '),
  )
</script>

{#if count > 1}
  <div class='space-y-2'>
    {#each Array.from({ length: count }) as _, i (i)}
      <div class={baseClass} {style}></div>
    {/each}
  </div>
{:else}
  <div class={baseClass} {style}></div>
{/if}

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      oklch(var(--b3)) 25%,
      oklch(var(--b2)) 50%,
      oklch(var(--b3)) 75%
    );
    background-size: 200% 100%;
  }

  .skeleton.animate-pulse {
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-pulse {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
