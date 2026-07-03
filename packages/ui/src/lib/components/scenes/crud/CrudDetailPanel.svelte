<!--
  @component CrudDetailPanel
  CRUD 详情组件（只读展示），支持抽屉（drawer）与弹窗（modal）两种展示形式

  使用 Svelte 5 Runes ($props, $derived)
  使用 compounds 组件：Drawer, Modal, Badge
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes, Size } from '../../../types.js'
  import type { CrudDensity, CrudFormVariant } from './crud-types.js'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import Drawer from '../../compounds/Drawer.svelte'
  import Modal from '../../compounds/Modal.svelte'
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
    density = 'normal' as CrudDensity,
    title = '',
    variant = 'drawer' as CrudFormVariant,
    size = '2xl' as Size,
    drawerWidth,
    modalSize = '2xl' as Size | 'full',
    modalWidth,
    modalHeight,
    canEdit = false,
    onedit,
    onclose,
    detailExtra,
    class: className = '',
    ...restProps
  }: {
    open?: boolean
    item?: Record<string, unknown> | null
    fields?: FieldDef[]
    density?: CrudDensity
    title?: string
    variant?: CrudFormVariant
    size?: Size
    drawerWidth?: string
    modalSize?: Size | 'full'
    modalWidth?: string
    modalHeight?: string
    canEdit?: boolean
    onedit?: () => void
    onclose?: () => void
    detailExtra?: Snippet<[Record<string, unknown>]>
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
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

    if (field.type === 'select' || field.type === 'radio') {
      const opts = resolveOptions(field.options)
      const found = opts.find(o => String(o.value) === String(value))
      return found?.label ?? String(value)
    }

    if (field.type === 'multi-select' && Array.isArray(value)) {
      const opts = resolveOptions(field.options)
      return value.map((v) => {
        const found = opts.find(o => String(o.value) === String(v))
        return found?.label ?? String(v)
      }).join(', ')
    }

    if (field.type === 'boolean' || field.type === 'checkbox') {
      return value ? '✓' : '✗'
    }

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

  const isCompact = $derived(density === 'compact')
  const contentClass = $derived(isCompact ? 'space-y-3' : 'space-y-4')
  const labelClass = $derived(isCompact ? 'text-[11px] font-medium text-base-content/50 mb-1' : 'text-xs font-medium text-base-content/50 mb-1')
  const valueClass = $derived(isCompact ? 'text-[13px] text-base-content' : 'text-sm text-base-content')
  const badgeSize = $derived(isCompact ? 'xs' : 'sm')
  const detailExtraClass = $derived(isCompact ? 'border-t border-base-content/5 pt-3' : 'border-t border-base-content/5 pt-4')
  const iconClass = $derived(isCompact ? 'size-3.5 mr-1' : 'size-4 mr-1')
  const drawerBodyClass = $derived(isCompact ? 'pb-16' : 'pb-20')
  const drawerFooterClass = $derived(isCompact ? 'absolute bottom-0 left-0 right-0 p-3 bg-base-200 border-t border-base-content/10 flex justify-end gap-2' : 'absolute bottom-0 left-0 right-0 p-4 bg-base-200 border-t border-base-content/10 flex justify-end gap-2')

  function handleClose() {
    open = false
    onclose?.()
  }
</script>

{#snippet detailBody()}
  {#if item}
    <div {...dataAttributes} class={contentClass}>
      {#each detailFields as field (field.id)}
        {@const value = item[field.id]}
        <div>
          <div class={labelClass}>
            {resolveText(field.label)}
          </div>
          <div class={valueClass}>
            {#if field.type === 'multi-select' && Array.isArray(value) && value.length > 0}
              <div class='flex flex-wrap gap-1'>
                {#each value as v, index (`${String(v)}:${index}`)}
                  {@const opts = resolveOptions(field.options)}
                  {@const found = opts.find(o => String(o.value) === String(v))}
                  <Badge variant='ghost' size={badgeSize}>{found?.label ?? String(v)}</Badge>
                {/each}
              </div>
            {:else}
              {formatValue(field, value)}
            {/if}
          </div>
        </div>
      {/each}

      {#if detailExtra && item}
        <div class={detailExtraClass}>
          {@render detailExtra(item)}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet footerActions()}
  {#if canEdit}
    <Button variant='primary' size='sm' onclick={onedit}>
      <span class='icon-[tabler--edit] {iconClass}'></span>
      {uiM('crud_edit')}
    </Button>
  {/if}
  <Button variant='ghost' size='sm' onclick={handleClose}>
    {uiM('crud_close')}
  </Button>
{/snippet}

{#if variant === 'modal'}
  <Modal
    bind:open
    class={className}
    {title}
    size={modalSize}
    width={modalWidth}
    height={modalHeight}
    onclose={handleClose}
  >
    {@render detailBody()}

    {#snippet footer()}
      {@render footerActions()}
    {/snippet}
  </Modal>
{:else}
  <Drawer bind:open {title} class={className} position='right' {size} width={drawerWidth} onclose={handleClose}>
    {#if item}
      <div class={drawerBodyClass}>
        {@render detailBody()}
      </div>

      <!-- 底部操作栏 -->
      <div class={drawerFooterClass}>
        {@render footerActions()}
      </div>
    {/if}
  </Drawer>
{/if}
