<!--
  =============================================================================
  UI Gallery - 示例卡片
  =============================================================================
  可折叠的组件示例卡片：标题/说明 + 实时效果 + 可查看与复制的源码。
  仅用于 admin-console 的 UI 组件库展示页。
  =============================================================================
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import * as m from '$lib/paraglide/messages'
  import { toast } from '@h-ai/ui'

  interface Props {
    /** 示例标题 */
    title: string
    /** 示例说明（可选） */
    description?: string
    /** 示例源码，用于查看与复制（可选） */
    code?: string
    /** 初始是否展开效果区 */
    open?: boolean
    /** 实时效果区内容 */
    children: Snippet
  }

  const { title, description = '', code = '', open = true, children }: Props = $props()

  // 仅以 open 的初始值决定展开态，之后由用户交互独立控制（无需随 prop 响应）。
  // svelte-ignore state_referenced_locally
  let expanded = $state(open)
  let codeVisible = $state(false)

  /** 复制源码到剪贴板，给出成功/失败反馈。 */
  async function copyCode() {
    if (!code) {
      return
    }

    try {
      await navigator.clipboard.writeText(code)
      toast.success(m.gallery_code_copied())
    }
    catch {
      toast.error(m.gallery_copy_failed())
    }
  }
</script>

<div class='overflow-hidden rounded-xl border border-base-300 bg-base-100'>
  <button
    type='button'
    class='flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-base-200/50'
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <div class='min-w-0'>
      <h3 class='truncate text-base font-semibold'>{title}</h3>
      {#if description}
        <p class='truncate text-sm text-base-content/60'>{description}</p>
      {/if}
    </div>
    <span
      class='icon-[tabler--chevron-down] size-5 shrink-0 text-base-content/50 transition-transform'
      class:rotate-180={expanded}
    ></span>
  </button>

  {#if expanded}
    <div class='border-t border-base-200'>
      <!-- 实时效果区 -->
      <div class='p-5'>
        {@render children()}
      </div>

      {#if code}
        <!-- 源码区 -->
        <div class='border-t border-base-200 bg-base-200/30'>
          <div class='flex items-center justify-between px-4 py-2'>
            <button
              type='button'
              class='inline-flex items-center gap-1.5 text-xs font-medium text-base-content/70 transition-colors hover:text-base-content'
              onclick={() => (codeVisible = !codeVisible)}
            >
              <span class='icon-[tabler--code] size-4'></span>
              {codeVisible ? m.gallery_hide_code() : m.gallery_show_code()}
            </button>
            <button
              type='button'
              class='inline-flex items-center gap-1.5 text-xs font-medium text-base-content/70 transition-colors hover:text-primary'
              onclick={copyCode}
            >
              <span class='icon-[tabler--copy] size-4'></span>
              {m.gallery_copy_code()}
            </button>
          </div>
          {#if codeVisible}
            <pre class='hai-demo-code overflow-x-auto px-4 pb-4 text-xs leading-relaxed'><code>{code}</code></pre>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .hai-demo-code {
    font-family:
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Consolas,
      'Liberation Mono',
      monospace;
    color: color-mix(in srgb, var(--color-base-content) 82%, transparent);
  }
</style>
