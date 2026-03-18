<!--
  @component CrudDetailDrawer
  CRUD 详情抽屉组件（只读展示）

  使用 Svelte 5 Runes ($props, $derived)
  使用 compounds 组件：Drawer, Badge
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { Size } from '../../../types.js'
  import { uiM } from '../../../messages.js'
  import Drawer from '../../compounds/Drawer.svelte'
  import Badge from '../../primitives/Badge.svelte'
  import Button from '../../primitives/Button.svelte'

  type FieldDef = {
    id: string
    label: string | (() => string)
    type: string
    inDetail?: boolean
    options?: Array<{ label: string, value: string | number | boolean }> | (() => Array<{ label: string, value: string | number | boolean }>)
    render?: (value: unknown, item: Record<string, unknown>) => string
    order?: number
  }

  let {
    open = $bindable(false),
    item = null,
    fields = [],
    title = '',
    size = '2xl' as Size,
    canEdit = false,
    onedit,
    onclose,
    detailExtra,
  }: {
    open?: boolean
    item?: Record<string, unknown> | null
    fields?: FieldDef[]
    title?: string
    size?: Size
    canEdit?: boolean
    onedit?: () => void
    onclose?: () => void
    detailExtra?: Snippet<[Record<string, unknown>]>
  } = $props()

  function resolveText(text: string | (() => string)): string {
    return typeof text === 'function' ? text() : text
  }

  function resolveOptions(options?: FieldDef['options']): Array<{ label: string, value: string | number | boolean }> {
    if (!options)
      return []
    return typeof options === 'function' ? options() : options
  }

  function formatValue(field: FieldDef, value: unknown): string {
    if (value === null || value === undefined)
      return uiM('crud_detail_empty')

    if (field.render && item) {
      return field.render(value, item)
    }

    // 选项类型：将 value 映射为 label
    if (field.type === 'select' || field.type === 'radio') {
      const opts = resolveOptions(field.options)
      const found = opts.find(o => String(o.value) === String(value))
      return found?.label ?? String(value)
    }

    // 多选类型
    if (field.type === 'multi-select' && Array.isArray(value)) {
      const opts = resolveOptions(field.options)
      return value.map((v) => {
        const found = opts.find(o => String(o.value) === String(v))
        return found?.label ?? String(v)
      }).join(', ')
    }

    // 布尔
    if (field.type === 'boolean' || field.type === 'checkbox') {
      return value ? '✓' : '✗'
    }

    // 日期/时间
    if (field.type === 'date' && (typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
      return new Date(value as string | number).toLocaleDateString()
    }
    if (field.type === 'datetime' && (typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
      return new Date(value as string | number).toLocaleString()
    }

    return String(value)
  }

  const detailFields = $derived(
    [...fields]
      .filter(f => f.inDetail !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  )

  function handleClose() {
    open = false
    onclose?.()
  }
</script>

<Drawer bind:open {title} position='right' {size} onclose={handleClose}>
  {#if item}
    <div class='space-y-4 pb-20'>
      {#each detailFields as field}
        {@const value = item[field.id]}
        <div>
          <div class='text-xs font-medium text-base-content/50 mb-1'>
            {resolveText(field.label)}
          </div>
          <div class='text-sm text-base-content'>
            {#if field.type === 'multi-select' && Array.isArray(value) && value.length > 0}
              <div class='flex flex-wrap gap-1'>
                {#each value as v}
                  {@const opts = resolveOptions(field.options)}
                  {@const found = opts.find(o => String(o.value) === String(v))}
                  <Badge variant='ghost' size='sm'>{found?.label ?? String(v)}</Badge>
                {/each}
              </div>
            {:else}
              {formatValue(field, value)}
            {/if}
          </div>
        </div>
      {/each}

      {#if detailExtra && item}
        <div class='border-t border-base-content/5 pt-4'>
          {@render detailExtra(item)}
        </div>
      {/if}
    </div>

    <!-- 底部操作栏 -->
    <div class='absolute bottom-0 left-0 right-0 p-4 bg-base-200 border-t border-base-content/10 flex justify-end gap-2'>
      {#if canEdit}
        <Button variant='primary' onclick={onedit}>
          <span class='icon-[tabler--edit] size-4 mr-1'></span>
          {uiM('crud_edit')}
        </Button>
      {/if}
      <Button variant='ghost' onclick={handleClose}>
        {uiM('crud_close')}
      </Button>
    </div>
  {/if}
</Drawer>
