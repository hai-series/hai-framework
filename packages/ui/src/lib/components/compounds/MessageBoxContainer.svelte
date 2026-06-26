<!--
  =============================================================================
  @h-ai/ui - MessageBoxContainer 组件
  =============================================================================
  命令式弹框容器，渲染 messageBox store 中的所有弹框。
  每个弹框由 MessageBoxDialog 独立管理 showModal()/close()。

  使用 DaisyUI 样式 + tabler icon，不依赖 ElementUI。
  =============================================================================
-->
<script lang='ts'>
  import { messageBox } from '../../messagebox.svelte.js'
  import MessageBoxDialog from './MessageBoxDialog.svelte'
</script>

{#each messageBox.items as item (item.id)}
  <MessageBoxDialog {item} />
{/each}
