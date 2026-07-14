<!--
  =============================================================================
  @h-ai/ui - FileUpload 组件
  =============================================================================
  文件上传组件，负责文件选择、校验、进度与列表展示

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 primitives 组件：Progress, IconButton
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { FileUploadProps, UploadFile } from '../types.js'
  import { SvelteMap } from 'svelte/reactivity'
  import { uiM } from '../../../messages.js'
  import { cn, generateId, getDataAttributes } from '../../../utils.js'
  import BareInput from '../../primitives/BareInput.svelte'
  import IconButton from '../../primitives/IconButton.svelte'
  import Progress from '../../primitives/Progress.svelte'

  const MAX_PARALLEL_UPLOADS = 3

  const {
    accept = '*',
    maxSize = 10 * 1024 * 1024, // 10MB
    maxFiles = 1,
    multiple = false,
    disabled = false,
    uploadHandler,
    autoUpload = true,
    showList = true,
    dragDrop = true,
    class: className = '',
    onchange,
    onupload,
    onerror,
    onremove,
    ...restProps
  }: FileUploadProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let files = $state<UploadFile[]>([])
  let isDragging = $state(false)
  let inputElement = $state<HTMLInputElement | undefined>(undefined)
  const activeRequests = new SvelteMap<string, AbortController>()

  const containerClass = $derived(
    cn(
      'file-upload',
      disabled && 'opacity-50 pointer-events-none',
      className,
    ),
  )

  const dropzoneClass = $derived(
    cn(
      'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
      isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary',
    ),
  )

  // 格式化文件大小
  function formatSize(bytes: number): string {
    if (bytes === 0)
      return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  // 验证文件
  function validateFile(file: File): string | null {
    if (file.size > maxSize) {
      return `${uiM('file_upload_size_exceeded')} ${formatSize(maxSize)}）`
    }

    if (accept !== '*') {
      const acceptedTypes = accept.split(',').map(t => t.trim())
      const fileType = file.type
      const fileExt = `.${file.name.split('.').pop()?.toLowerCase()}`

      const isAccepted = acceptedTypes.some((type) => {
        if (type.startsWith('.')) {
          return fileExt === type.toLowerCase()
        }
        if (type.endsWith('/*')) {
          return fileType.startsWith(type.replace('/*', '/'))
        }
        return fileType === type
      })

      if (!isAccepted) {
        return uiM('file_upload_unsupported_type')
      }
    }

    return null
  }

  function registerActiveRequest(fileId: string, controller: AbortController): void {
    activeRequests.set(fileId, controller)
  }

  function clearActiveRequest(fileId: string, controller?: AbortController): void {
    const current = activeRequests.get(fileId)
    if (!current || (controller && current !== controller)) {
      return
    }

    activeRequests.delete(fileId)
  }

  function abortActiveRequest(fileId: string): void {
    const current = activeRequests.get(fileId)
    if (!current) {
      return
    }

    current.abort()
    activeRequests.delete(fileId)
  }

  function abortAllActiveRequests(): void {
    for (const fileId of [...activeRequests.keys()]) {
      abortActiveRequest(fileId)
    }
  }

  async function uploadPendingFiles(targetFiles: UploadFile[]): Promise<void> {
    const queue = [...targetFiles]
    const workerCount = Math.min(MAX_PARALLEL_UPLOADS, queue.length)

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const nextFile = queue.shift()
          if (!nextFile) {
            return
          }

          await uploadFile(nextFile)
        }
      }),
    )
  }

  $effect(() => {
    return () => {
      abortAllActiveRequests()
    }
  })

  // 添加文件
  async function addFiles(fileList: FileList | null) {
    if (!fileList)
      return

    const newFiles: UploadFile[] = []

    for (const file of Array.from(fileList)) {
      if (files.length + newFiles.length >= maxFiles) {
        onerror?.(`${uiM('file_upload_max_files_exceeded')} ${maxFiles} ${uiM('file_upload_files_unit')}`)
        break
      }

      const error = validateFile(file)

      const uploadFile: UploadFile = {
        id: generateId('file'),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        state: error ? 'error' : 'pending',
        progress: 0,
        error: error || undefined,
      }

      newFiles.push(uploadFile)
    }

    files = [...files, ...newFiles]
    onchange?.(files)

    // 自动上传
    if (autoUpload) {
      await uploadPendingFiles(newFiles.filter(f => f.state === 'pending'))
    }
  }

  // 上传单个文件
  async function uploadFile(uploadFile: UploadFile) {
    if (!uploadHandler) {
      return
    }

    uploadFile.state = 'uploading'
    files = [...files]

    const controller = new AbortController()
    registerActiveRequest(uploadFile.id, controller)

    try {
      const result = await uploadHandler(uploadFile.file, {
        signal: controller.signal,
        onProgress(progress) {
          uploadFile.progress = Math.max(0, Math.min(100, Math.round(progress)))
          files = [...files]
        },
      })

      if (controller.signal.aborted) {
        return
      }

      uploadFile.state = 'success'
      uploadFile.progress = 100
      uploadFile.response = result.response ?? result.url
      onupload?.(uploadFile)
    }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      uploadFile.state = 'error'
      uploadFile.error = error instanceof Error ? error.message : uiM('file_upload_failed')
      onerror?.(uploadFile.error)
    }
    finally {
      clearActiveRequest(uploadFile.id, controller)
    }

    files = [...files]
  }

  // 移除文件
  function removeFile(id: string) {
    const file = files.find(f => f.id === id)
    if (file) {
      abortActiveRequest(id)
      files = files.filter(f => f.id !== id)
      onremove?.(file)
      onchange?.(files)
    }
  }

  // 重试上传
  async function retryUpload(id: string) {
    const file = files.find(f => f.id === id)
    if (file && file.state === 'error') {
      file.state = 'pending'
      file.error = undefined
      file.progress = 0
      files = [...files]
      await uploadFile(file)
    }
  }

  // 拖拽处理
  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    if (dragDrop) {
      isDragging = true
    }
  }

  function handleDragLeave() {
    isDragging = false
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    isDragging = false
    if (dragDrop) {
      addFiles(e.dataTransfer?.files || null)
    }
  }

  function handleClick() {
    inputElement?.click()
  }

  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    addFiles(e.currentTarget.files)
    e.currentTarget.value = ''
  }

  /** 手动触发上传 */
  export async function upload() {
    await uploadPendingFiles(files.filter(f => f.state === 'pending'))
  }

  /** 清空文件列表 */
  export function clear() {
    abortAllActiveRequests()
    files = []
    onchange?.(files)
  }
</script>

<div {...dataAttributes} class={containerClass}>
  <!-- 上传区域 -->
  <div
    class={dropzoneClass}
    role='button'
    tabindex='0'
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    onclick={handleClick}
    onkeydown={e => e.key === 'Enter' && handleClick()}
  >
    <BareInput
      type='file'
      class='hidden'
      bind:inputRef={inputElement}
      {accept}
      {multiple}
      {disabled}
      onchange={handleChange}
    />

    <div class='flex flex-col items-center gap-2'>
      <svg xmlns='http://www.w3.org/2000/svg' class='h-12 w-12 text-base-content/30' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' />
      </svg>
      <div class='text-base-content/70'>
        {#if dragDrop}
          <span>{uiM('file_upload_drag_hint')}</span>
        {/if}
        <span class='text-primary'>{uiM('file_upload_click_to_select')}</span>
      </div>
      <div class='text-xs text-base-content/50'>
        {#if accept !== '*'}
          {uiM('file_upload_supported_formats')} {accept}，
        {/if}
        {uiM('file_upload_max_size')} {formatSize(maxSize)}
        {#if maxFiles > 1}
          ，{uiM('file_upload_max_files_hint')} {maxFiles} {uiM('file_upload_files_unit')}
        {/if}
      </div>
    </div>
  </div>

  <!-- 文件列表 -->
  {#if showList && files.length > 0}
    <div class='mt-4 space-y-2'>
      {#each files as file (file.id)}
        <div class='flex items-center gap-3 p-3 bg-base-200 rounded-lg'>
          <!-- 文件图标 -->
          <div class='text-base-content/50'>
            <svg xmlns='http://www.w3.org/2000/svg' class='h-8 w-8' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
            </svg>
          </div>

          <!-- 文件信息 -->
          <div class='flex-1 min-w-0'>
            <div class='flex items-center gap-2'>
              <span class='truncate font-medium'>{file.name}</span>
              <span class='text-xs text-base-content/50'>{formatSize(file.size)}</span>
            </div>

            {#if file.state === 'uploading'}
              <div class='mt-1'>
                <Progress value={file.progress} max={100} size='xs' />
                <span class='text-xs text-base-content/50'>{file.progress}%</span>
              </div>
            {:else if file.state === 'error'}
              <div class='text-xs text-error mt-1'>{file.error}</div>
            {:else if file.state === 'success'}
              <div class='text-xs text-success mt-1'>{uiM('file_upload_success')}</div>
            {/if}
          </div>

          <!-- 操作按钮 -->
          <div class='flex gap-1'>
            {#if file.state === 'error'}
              <IconButton
                size='xs'
                variant='ghost'
                label={uiM('file_upload_retry')}
                onclick={() => retryUpload(file.id)}
              >
                <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
                </svg>
              </IconButton>
            {/if}
            <IconButton
              size='xs'
              variant='ghost'
              label={uiM('file_upload_remove')}
              onclick={() => removeFile(file.id)}
            >
              <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
              </svg>
            </IconButton>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
