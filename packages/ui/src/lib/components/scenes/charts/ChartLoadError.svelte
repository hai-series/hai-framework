<!-- 图形模块加载失败时使用统一 Toast，原位保留重试操作。 -->
<script lang='ts'>
  import { uiM } from '../../../messages.js'
  import { useToastFeedback } from '../../../toast.svelte.js'
  import Button from '../../primitives/Button.svelte'
  /** 重试由 Chart 重新创建本次动态导入。 */
  const { onretry }: { onretry: () => void } = $props()
  useToastFeedback(() => uiM('chart_load_failed'))
</script>

<div class='flex h-full items-center justify-center'>
  <Button onclick={onretry} size='sm'>{uiM('chart_retry')}</Button>
</div>
