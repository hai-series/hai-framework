<!-- 表单字段布局，供 Form 和原生表单/场景组件共同复用。 -->
<script lang='ts'>
  import type { FormLayoutProps } from '../../types.js'
  import { setContext } from 'svelte'
  import { FORM_LAYOUT_CONTEXT } from '../../internal/form-context.js'
  import { cn, getDataAttributes } from '../../utils.js'

  const {
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    class: className = '',
    children,
    ...restProps
  }: FormLayoutProps = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  setContext(FORM_LAYOUT_CONTEXT, {
    get labelPosition() { return labelPosition },
    get labelWidth() { return labelWidth },
  })
</script>

<div {...dataAttributes} class={cn('hai-form-layout', className)}>
  <div class='hai-form-grid' data-columns={columns}>
    {#if children}{@render children()}{/if}
  </div>
</div>

<style>
  .hai-form-layout {
    container: hai-form / inline-size;
    width: 100%;
    min-width: 0;
  }

  .hai-form-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--hai-form-gap, 1rem);
    align-items: start;
  }

  .hai-form-grid > :global(*) {
    min-width: 0;
  }

  @container hai-form (min-width: 36rem) {
    .hai-form-grid[data-columns='2'] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hai-form-grid[data-columns='2'] > :global(:not(.hai-form-field)),
    .hai-form-grid[data-columns='2'] > :global(.hai-form-field[data-col-span='2']),
    .hai-form-grid[data-columns='2'] > :global(.hai-form-field[data-col-span='auto']:has(textarea, input[type='file'], [data-form-wide], [aria-multiselectable='true'])) {
      grid-column: 1 / -1;
    }
  }
</style>
