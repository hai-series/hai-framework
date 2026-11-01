<script lang='ts'>
  import ChartRendererMock from './ChartRendererMock.svelte'

  const { ...props }: Record<string, unknown> = $props()
</script>
<div data-bar-renderer><ChartRendererMock {...props} /></div>
