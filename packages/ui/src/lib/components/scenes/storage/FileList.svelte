<!--
  =============================================================================
  @hai/ui - FileList 组件
  =============================================================================
  文件列表展示组件
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { FileListProps, FileItem } from '../types.js'
  import { cn } from '../../../utils.js'
  import { m } from '../../../messages.js'
  
  let {
    files = [],
    loading = false,
    showPreview = true,
    showDownload = true,
    showDelete = true,
    showSize = true,
    showDate = true,
    layout = 'list',
    class: className = '',
    ondownload,
    ondelete,
    onpreview,
  }: FileListProps = $props()
  
  let previewFile = $state<FileItem | null>(null)
  
  const containerClass = $derived(
    cn(
      'file-list',
      layout === 'grid' && 'grid grid-cols-2 md:grid-cols-4 gap-4',
      layout === 'list' && 'space-y-2',
      className,
    )
  )
  
  // 格式化文件大小
  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }
  
  // 格式化日期
  function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  
  // 获取文件图标
  function getFileIcon(type: string): string {
    if (type.startsWith('image/')) return '🖼️'
    if (type.startsWith('video/')) return '🎬'
    if (type.startsWith('audio/')) return '🎵'
    if (type.includes('pdf')) return '📄'
    if (type.includes('word') || type.includes('document')) return '📝'
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊'
    if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return '📦'
    return '📁'
  }
  
  // 是否可预览
  function canPreview(file: FileItem): boolean {
    return file.type.startsWith('image/') || file.type.startsWith('video/') || file.type === 'application/pdf'
  }
  
  function handlePreview(file: FileItem) {
    if (onpreview) {
      onpreview(file)
    } else {
      previewFile = file
    }
  }
  
  function handleDownload(file: FileItem) {
    ondownload?.(file)
  }
  
  function handleDelete(file: FileItem) {
    ondelete?.(file)
  }
  
  function closePreview() {
    previewFile = null
  }
</script>

{#if loading}
  <div class="flex justify-center py-8">
    <span class="loading loading-spinner loading-lg"></span>
  </div>
{:else if files.length === 0}
  <div class="text-center py-8 text-base-content/50">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
    <p>{m('file_list_no_files')}</p>
  </div>
{:else}
  <div class={containerClass}>
    {#each files as file (file.id)}
      {#if layout === 'grid'}
        <!-- 网格布局 -->
        <div class="card bg-base-200 overflow-hidden">
          {#if file.type.startsWith('image/') && file.url}
            <figure class="aspect-square bg-base-300">
              <img src={file.url} alt={file.name} class="object-cover w-full h-full" />
            </figure>
          {:else}
            <figure class="aspect-square bg-base-300 flex items-center justify-center">
              <span class="text-4xl">{getFileIcon(file.type)}</span>
            </figure>
          {/if}
          <div class="card-body p-3">
            <h3 class="card-title text-sm truncate">{file.name}</h3>
            {#if showSize}
              <p class="text-xs text-base-content/50">{formatSize(file.size)}</p>
            {/if}
            <div class="card-actions justify-end mt-2">
              {#if showPreview && canPreview(file)}
                <button class="btn btn-ghost btn-xs" onclick={() => handlePreview(file)}>
                  {m('file_list_preview')}
                </button>
              {/if}
              {#if showDownload}
                <button class="btn btn-ghost btn-xs" onclick={() => handleDownload(file)}>
                  {m('file_list_download')}
                </button>
              {/if}
              {#if showDelete}
                <button class="btn btn-ghost btn-xs text-error" onclick={() => handleDelete(file)}>
                  {m('file_list_delete')}
                </button>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <!-- 列表布局 -->
        <div class="flex items-center gap-3 p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors">
          <!-- 文件图标/缩略图 -->
          <div class="w-12 h-12 flex items-center justify-center bg-base-300 rounded">
            {#if file.type.startsWith('image/') && file.url}
              <img src={file.url} alt={file.name} class="w-full h-full object-cover rounded" />
            {:else}
              <span class="text-2xl">{getFileIcon(file.type)}</span>
            {/if}
          </div>
          
          <!-- 文件信息 -->
          <div class="flex-1 min-w-0">
            <h3 class="font-medium truncate">{file.name}</h3>
            <div class="flex gap-3 text-xs text-base-content/50">
              {#if showSize}
                <span>{formatSize(file.size)}</span>
              {/if}
              {#if showDate && file.updatedAt}
                <span>{formatDate(file.updatedAt)}</span>
              {/if}
            </div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="flex gap-1">
            {#if showPreview && canPreview(file)}
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-circle"
                onclick={() => handlePreview(file)}
                aria-label={m('file_list_preview')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            {/if}
            {#if showDownload}
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-circle"
                onclick={() => handleDownload(file)}
                aria-label={m('file_list_download')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            {/if}
            {#if showDelete}
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-circle text-error"
                onclick={() => handleDelete(file)}
                aria-label={m('file_list_delete')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<!-- 预览模态框 -->
{#if previewFile}
  <dialog class="modal modal-open" onclick={closePreview}>
    <div
      class="modal-box max-w-4xl"
      role="dialog"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick={closePreview}>✕</button>
      <h3 class="font-bold text-lg mb-4">{previewFile.name}</h3>
      
      {#if previewFile.type.startsWith('image/')}
        <img src={previewFile.url} alt={previewFile.name} class="max-w-full max-h-[70vh] mx-auto" />
      {:else if previewFile.type.startsWith('video/')}
        <video src={previewFile.url} controls class="max-w-full max-h-[70vh] mx-auto">
          <track kind="captions" />
        </video>
      {:else if previewFile.type === 'application/pdf'}
        <iframe src={previewFile.url} class="w-full h-[70vh]" title={previewFile.name}></iframe>
      {/if}
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>{m('file_list_close')}</button>
    </form>
  </dialog>
{/if}
