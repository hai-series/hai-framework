<!--
  @component JsonViewer
  =============================================================================
  @h-ai/ui - JsonViewer 组件
  =============================================================================
  JSON 数据查看组件：可折叠树、类型着色（DaisyUI 语义色，跟随主题与暗色模式）、
  复制按钮、超长文本截断。用于诊断数据、运行快照等任意 JSON 展示场景。

  使用 Svelte 5 Runes ($props, $state, $derived, $props)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { JsonViewer } from '@h-ai/ui'
  const props: ComponentProps<typeof JsonViewer> = { value: { name: 'wf', nested: { list: [1, 2] } } }
  const component = mount(JsonViewer, { target: document.body, props })
  await unmount(component)
  ```
-->

<script lang='ts'>
  import type { DataAttributes, JsonViewerProps } from '../../types.js'
  import { onDestroy } from 'svelte'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'

  const {
    value,
    defaultExpandedDepth = 0,
    maxScalarLength = 240,
    showCopy = true,
    class: className = '',
    onCopy,
    ...restProps
  }: JsonViewerProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))

  /// 循环引用会出现在诊断数据中，渲染和复制前统一替换为占位符而不是抛错。
  function decycle(input: unknown): unknown {
    const seen = new WeakSet<object>()
    function walk(current: unknown): unknown {
      if (typeof current !== 'object' || current === null)
        return current
      if (seen.has(current))
        return '[Circular]'
      seen.add(current)
      if (Array.isArray(current))
        return current.map(walk)
      const next: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(current))
        next[key] = walk(val)
      return next
    }
    return walk(input)
  }

  const safeValue = $derived(decycle(value))
  const serialized = $derived(JSON.stringify(safeValue, null, 2) ?? 'undefined')

  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  function truncate(text: string): string {
    return text.length > maxScalarLength ? `${text.slice(0, maxScalarLength)}…` : text
  }

  async function copyValue(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(serialized)
      copied = true
      onCopy?.(serialized)
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied = false), 2000)
    }
    catch {
    // 剪贴板不可用（非安全上下文或权限拒绝）时静默降级，不打断树浏览。
    }
  }

  /**
   * 节点自描述：标量直接渲染，容器交给递归片段。
   * @example 模块内部上下文
   * ```ts
   * const node: NodeModel = { key: 'enabled', value: true, depth: 1 }
   * ```
   */
  interface NodeModel {
    key: string | null
    value: unknown
    depth: number
  }

  function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
    return typeof v === 'object' && v !== null
  }

  function containerSize(v: Record<string, unknown> | unknown[]): number {
    return Array.isArray(v) ? v.length : Object.keys(v).length
  }

  function containerEntries(v: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
    if (Array.isArray(v))
      return v.map((item, index) => [String(index), item] as [string, unknown])
    return Object.entries(v)
  }

  function typeClass(v: unknown): string {
    if (v === null)
      return 'text-base-content/50'
    switch (typeof v) {
      case 'string': return 'text-success'
      case 'number': return 'text-info'
      case 'boolean': return 'text-warning'
      case 'undefined': return 'text-base-content/50'
      default: return 'text-base-content'
    }
  }

  function scalarText(v: unknown): string {
    if (v === undefined)
      return 'undefined'
    if (v === null)
      return 'null'
    if (typeof v === 'string')
      return JSON.stringify(truncate(v))
    return truncate(String(v))
  }

  /** 大容器折叠可显著降低 DOM 数量，200 条以内保持完整交互。 */
  function childKeys(v: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
    return containerSize(v) > 200 ? containerEntries(v).slice(0, 200) : containerEntries(v)
  }

  onDestroy(() => clearTimeout(copyTimer))
</script>

{#snippet treeNode(node: NodeModel)}
  {#if isContainer(node.value)}
    {#each childKeys(node.value) as [key, child] (key)}
      {#if isContainer(child)}
        <details
          class='group'
          open={node.depth < defaultExpandedDepth}
          data-testid='json-viewer-node'
        >
          <summary class='flex min-w-0 cursor-pointer select-none items-center gap-1 py-0.5 text-base-content/80'>
            <span class='text-base-content/40 group-open:hidden transition-transform' aria-hidden='true'>▶</span>
            <span class='text-base-content/40 hidden group-open:inline transition-transform' aria-hidden='true'>▼</span>
            <span class='font-mono text-xs font-medium'>{key}:</span>
            <span class='font-mono text-xs text-base-content/50'>
              {Array.isArray(child) ? `Array(${containerSize(child)})` : `Object(${containerSize(child)})`}
            </span>
          </summary>
          <div class='ml-3 border-l border-base-content/10 pl-3'>
            {@render treeNode({ key, value: child, depth: node.depth + 1 })}
          </div>
        </details>
      {:else}
        <div class='flex min-w-0 items-baseline gap-1 py-0.5'>
          <span class='font-mono text-xs font-medium text-base-content/80'>{key}:</span>
          <span class='font-mono text-xs {typeClass(child)} [overflow-wrap:anywhere]'>{scalarText(child)}</span>
        </div>
      {/if}
    {/each}
  {:else}
    <div class='flex min-w-0 items-baseline gap-1 py-0.5'>
      <span class='font-mono text-xs {typeClass(node.value)} [overflow-wrap:anywhere]'>{scalarText(node.value)}</span>
    </div>
  {/if}
{/snippet}

<div
  {...dataAttributes}
  class={cn(
    'flex min-w-0 flex-col gap-2 rounded-container bg-base-200/40 p-3',
    className,
  )}
  data-testid='json-viewer'
>
  {#if showCopy}
    <div class='flex justify-end'>
      <button
        type='button'
        class='btn btn-ghost btn-xs gap-1 font-normal text-base-content/60'
        data-testid='json-viewer-copy'
        onclick={copyValue}
      >
        {#if copied}
          <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='2' stroke='currentColor' class='size-3.5' aria-hidden='true'>
            <path stroke-linecap='round' stroke-linejoin='round' d='M4.5 12.75l6 6 9-13.5' />
          </svg>
          {uiM('json_viewer_copied')}
        {:else}
          <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='currentColor' class='size-3.5' aria-hidden='true'>
            <path stroke-linecap='round' stroke-linejoin='round' d='M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-15.043-6.603-8.25-8.25-9.75L15.75 17.25z' />
          </svg>
          {uiM('json_viewer_copy')}
        {/if}
      </button>
    </div>
  {/if}
  <div class='min-w-0 overflow-x-auto font-mono text-xs leading-relaxed'>
    {#if isContainer(safeValue)}
      {@render treeNode({ key: null, value: safeValue, depth: 0 })}
    {:else}
      <span class={typeClass(safeValue)}>{scalarText(safeValue)}</span>
    {/if}
  </div>
</div>
