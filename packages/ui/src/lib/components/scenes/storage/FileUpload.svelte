<!--
  =============================================================================
  @hai/ui - FileUpload 组件
  =============================================================================
  文件上传组件，支持签名 URL 直传和多文件上传
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { FileUploadProps, UploadFile } from '../types.js'
  import { cn, generateId } from '../../../utils.js'
  
  let {
    accept = '*',
    maxSize = 10 * 1024 * 1024, // 10MB
    maxFiles = 1,
    multiple = false,
    disabled = false,
    uploadUrl = '',
    presignUrl = '',
    headers = {},
    autoUpload = true,
    showList = true,
    dragDrop = true,
    class: className = '',
    onchange,
    onupload,
    onerror,
    onremove,
  }: FileUploadProps = $props()
  
  let files = $state<UploadFile[]>([])
  let isDragging = $state(false)
  let inputElement: HTMLInputElement
  
  const containerClass = $derived(
    cn(
      'file-upload',
      disabled && 'opacity-50 pointer-events-none',
      className,
    )
  )
  
  const dropzoneClass = $derived(
    cn(
      'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
      isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary',
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
  
  // 验证文件
  function validateFile(file: File): string | null {
    if (file.size > maxSize) {
      return `文件大小超过限制（最大 ${formatSize(maxSize)}）`
    }
    
    if (accept !== '*') {
      const acceptedTypes = accept.split(',').map(t => t.trim())
      const fileType = file.type
      const fileExt = `.${file.name.split('.').pop()?.toLowerCase()}`
      
      const isAccepted = acceptedTypes.some(type => {
        if (type.startsWith('.')) {
          return fileExt === type.toLowerCase()
        }
        if (type.endsWith('/*')) {
          return fileType.startsWith(type.replace('/*', '/'))
        }
        return fileType === type
      })
      
      if (!isAccepted) {
        return '不支持的文件类型'
      }
    }
    
    return null
  }
  
  // 添加文件
  async function addFiles(fileList: FileList | null) {
    if (!fileList) return
    
    const newFiles: UploadFile[] = []
    
    for (const file of Array.from(fileList)) {
      if (files.length + newFiles.length >= maxFiles) {
        onerror?.(`最多只能上传 ${maxFiles} 个文件`)
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
      for (const file of newFiles.filter(f => f.state === 'pending')) {
        await uploadFile(file)
      }
    }
  }
  
  // 上传单个文件
  async function uploadFile(uploadFile: UploadFile) {
    if (!uploadUrl && !presignUrl) {
      uploadFile.error = '未配置上传地址'
      uploadFile.state = 'error'
      return
    }
    
    uploadFile.state = 'uploading'
    files = [...files]
    
    try {
      let targetUrl = uploadUrl
      
      // 如果配置了签名 URL，先获取
      if (presignUrl) {
        const presignResponse = await fetch(presignUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            filename: uploadFile.name,
            contentType: uploadFile.type,
            size: uploadFile.size,
          }),
        })
        
        if (!presignResponse.ok) {
          throw new Error('获取上传地址失败')
        }
        
        const { url } = await presignResponse.json()
        targetUrl = url
      }
      
      // 上传文件
      const xhr = new XMLHttpRequest()
      
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            uploadFile.progress = Math.round((e.loaded / e.total) * 100)
            files = [...files]
          }
        }
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            uploadFile.state = 'success'
            uploadFile.progress = 100
            try {
              uploadFile.response = JSON.parse(xhr.responseText)
            } catch {
              uploadFile.response = xhr.responseText
            }
            resolve()
          } else {
            reject(new Error(`上传失败: ${xhr.statusText}`))
          }
        }
        
        xhr.onerror = () => reject(new Error('网络错误'))
        
        xhr.open('PUT', targetUrl!)
        xhr.setRequestHeader('Content-Type', uploadFile.type || 'application/octet-stream')
        
        for (const [key, value] of Object.entries(headers)) {
          xhr.setRequestHeader(key, value)
        }
        
        xhr.send(uploadFile.file)
      })
      
      onupload?.(uploadFile)
    } catch (error) {
      uploadFile.state = 'error'
      uploadFile.error = error instanceof Error ? error.message : '上传失败'
      onerror?.(uploadFile.error)
    }
    
    files = [...files]
  }
  
  // 移除文件
  function removeFile(id: string) {
    const file = files.find(f => f.id === id)
    if (file) {
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
    for (const file of files.filter(f => f.state === 'pending')) {
      await uploadFile(file)
    }
  }
  
  /** 清空文件列表 */
  export function clear() {
    files = []
    onchange?.(files)
  }
</script>

<div class={containerClass}>
  <!-- 上传区域 -->
  <div
    class={dropzoneClass}
    role="button"
    tabindex="0"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    onclick={handleClick}
    onkeydown={(e) => e.key === 'Enter' && handleClick()}
  >
    <input
      bind:this={inputElement}
      type="file"
      {accept}
      {multiple}
      {disabled}
      class="hidden"
      onchange={handleChange}
    />
    
    <div class="flex flex-col items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <div class="text-base-content/70">
        {#if dragDrop}
          <span>拖拽文件到此处，或</span>
        {/if}
        <span class="text-primary">点击选择文件</span>
      </div>
      <div class="text-xs text-base-content/50">
        {#if accept !== '*'}
          支持 {accept}，
        {/if}
        单个文件最大 {formatSize(maxSize)}
        {#if maxFiles > 1}
          ，最多 {maxFiles} 个文件
        {/if}
      </div>
    </div>
  </div>
  
  <!-- 文件列表 -->
  {#if showList && files.length > 0}
    <div class="mt-4 space-y-2">
      {#each files as file (file.id)}
        <div class="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
          <!-- 文件图标 -->
          <div class="text-base-content/50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          
          <!-- 文件信息 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{file.name}</span>
              <span class="text-xs text-base-content/50">{formatSize(file.size)}</span>
            </div>
            
            {#if file.state === 'uploading'}
              <div class="mt-1">
                <progress class="progress progress-primary w-full h-1" value={file.progress} max="100"></progress>
                <span class="text-xs text-base-content/50">{file.progress}%</span>
              </div>
            {:else if file.state === 'error'}
              <div class="text-xs text-error mt-1">{file.error}</div>
            {:else if file.state === 'success'}
              <div class="text-xs text-success mt-1">上传成功</div>
            {/if}
          </div>
          
          <!-- 操作按钮 -->
          <div class="flex gap-1">
            {#if file.state === 'error'}
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-circle"
                onclick={() => retryUpload(file.id)}
                aria-label="重试"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            {/if}
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-circle"
              onclick={() => removeFile(file.id)}
              aria-label="移除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
