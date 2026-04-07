<script lang="ts" setup>
/**
 * 开箱即用：工作流 outputs 或已解析 A2UI 消息 → A2StaticRenderer。
 * 样式由业务侧引入 @vkdevfolio/a2ui-vue 的 CSS（见 README）。
 */
import { A2StaticRenderer } from '@vkdevfolio/a2ui-vue'
import { computed } from 'vue'
import { buildAssistantDisplayFromOutputs } from './parseWorkflowOutputs'

const props = withDefaults(defineProps<{
  /** 工作流 / 接口返回的 outputs 对象（含 systemResponse、a2ui 等） */
  outputs?: Record<string, unknown> | null
  /** 已解析的 A2UI v0.10 消息数组；与 outputs 同时传时优先用 messages */
  messages?: unknown[] | null
}>(), {
  outputs: null,
  messages: null,
})

const display = computed(() => {
  if (props.messages && props.messages.length > 0) {
    return {
      chat_content: '',
      a2ui_messages: props.messages,
    }
  }
  if (props.outputs && typeof props.outputs === 'object')
    return buildAssistantDisplayFromOutputs(props.outputs)
  return { chat_content: '', a2ui_messages: [] as unknown[] }
})
</script>

<template>
  <div class="a2ui-workflow-view">
    <A2StaticRenderer
      v-if="display.a2ui_messages?.length"
      :messages="(display.a2ui_messages || []) as any[]"
    />
    <div
      v-else-if="display.chat_content"
      class="a2ui-workflow-view__fallback"
      v-html="display.chat_content.replace(/\n/g, '<br>')"
    />
    <slot v-else name="empty" />
  </div>
</template>

<style scoped>
.a2ui-workflow-view {
  min-width: 0;
}
.a2ui-workflow-view__fallback {
  font-size: 14px;
  line-height: 1.6;
  color: var(--a2ui-text, #303133);
}
</style>
