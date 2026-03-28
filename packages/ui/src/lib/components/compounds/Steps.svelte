<!--
  =============================================================================
  @h-ai/ui - Steps 组件
  =============================================================================
  步骤条组件

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { StepsProps } from '../../types.js'
  import { cn } from '../../utils.js'

  const {
    items = [],
    current = 0,
    direction = 'horizontal',
    size = 'md',
    clickable = false,
    class: className = '',
    onchange,
  }: StepsProps = $props()

  const containerClass = $derived(
    cn(
      'steps',
      direction === 'vertical' && 'steps-vertical',
      className,
    ),
  )

  const stepSizeClass = $derived({
    xs: 'step-xs',
    sm: 'step-sm',
    md: '',
    lg: 'step-lg',
  }[size] || '')

  function getStepStatus(index: number): 'completed' | 'current' | 'pending' {
    if (index < current)
      return 'completed'
    if (index === current)
      return 'current'
    return 'pending'
  }

  function getStepClass(index: number) {
    const status = getStepStatus(index)
    return cn(
      'step',
      stepSizeClass,
      status === 'completed' && 'step-primary',
      status === 'current' && 'step-primary',
      clickable && 'cursor-pointer hover:opacity-80',
    )
  }

  function handleClick(index: number) {
    if (clickable) {
      onchange?.(index)
    }
  }
</script>

<ul class={containerClass}>
  {#each items as item, index (index)}
    {#if clickable}
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <li
        class={getStepClass(index)}
        data-content={item.icon || (index < current ? '✓' : index + 1)}
        onclick={() => handleClick(index)}
        onkeydown={e => e.key === 'Enter' && handleClick(index)}
        role='button'
        tabindex='0'
      >
        <div class='step-content'>
          <span class='font-medium'>{item.title}</span>
          {#if item.description}
            <span class='text-xs text-base-content/60'>{item.description}</span>
          {/if}
        </div>
      </li>
    {:else}
      <li
        class={getStepClass(index)}
        data-content={item.icon || (index < current ? '✓' : index + 1)}
      >
        <div class='step-content'>
          <span class='font-medium'>{item.title}</span>
          {#if item.description}
            <span class='text-xs text-base-content/60'>{item.description}</span>
          {/if}
        </div>
      </li>
    {/if}
  {/each}
</ul>

<style>
  .step-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .steps-vertical .step-content {
    margin-left: 0.5rem;
  }
</style>
