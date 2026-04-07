<script lang="ts" setup>
/**
 * 纯 A2UI：只接收 v0.10 消息数组，不经 workflow outputs 解析。
 * 适用于 Agent 直接产出 JSON 数组、或已在前端组装好的 messages。
 */
import { A2StaticRenderer } from '@vkdevfolio/a2ui-vue'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** A2UI v0.10 消息数组 */
  messages: unknown[] | null | undefined
}>(), {
  messages: () => [],
})

const list = computed(() => (Array.isArray(props.messages) ? props.messages : []))
</script>

<template>
  <div class="a2ui-message-view">
    <A2StaticRenderer v-if="list.length" :messages="list as any[]" />
    <slot v-else name="empty" />
  </div>
</template>

<style scoped>
.a2ui-message-view {
  min-width: 0;
}
</style>
