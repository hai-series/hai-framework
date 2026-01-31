<!--
  =============================================================================
  @hai/ui - ImageUpload 组件
  =============================================================================
  图片上传组件，支持预览
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { ImageUploadProps } from '../types.js'
  import { cn } from '../../../utils.js'
  
  const defaultLabels = {
    placeholder: 'Click to upload image',
    maxSizeHint: 'Max:',
    sizeExceeded: 'Image size exceeds limit (max',
    invalidType: 'Please select an image file',
    getUploadUrlFailed: 'Failed to get upload URL',
    uploadFailed: 'Upload failed',
    previewAlt: 'Preview',
    changeImage: 'Change image',
    deleteImage: 'Delete image',
  }
  
  let {
    value = $bindable(''),
    accept = 'image/*',
    maxSize = 5 * 1024 * 1024, // 5MB
    disabled = false,
    uploadUrl = '',
    presignUrl = '',
    headers = {},
    placeholder,
    labels = {},
    aspectRatio = '',
    width = '',
    height = '',
    class: className = '',
    onchange,
    onerror,
  }: ImageUploadProps = $props()
  
  const mergedLabels = $derived({ ...defaultLabels, ...labels })
  
  let loading = $state(false)
  let inputElement: HTMLInputElement
  let previewUrl = $state('')
  
  // 当 value 变化时更新预览
  $effect(() => {
    previewUrl = value
  })
  
  const containerClass = $derived(
    cn(
      'image-upload relative overflow-hidden rounded-lg border-2 border-dashed transition-colors',
      !disabled && 'cursor-pointer hover:border-primary',
      disabled && 'opacity-50 cursor-not-allowed',
      previewUrl ? 'border-transparent' : 'border-base-300',
      className,
    )
  )
  
  const containerStyle = $derived(
    [
      width && `width: ${width}`,
      height && `height: ${height}`,
      aspectRatio && `aspect-ratio: ${aspectRatio}`,
      !width && !height && !aspectRatio && 'width: 200px; height: 200px',
    ].filter(Boolean).join('; ')
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
      return `${mergedLabels.sizeExceeded} ${formatSize(maxSize)}）`
    }
    
    if (!file.type.startsWith('image/')) {
      return mergedLabels.invalidType
    }
    
    return null
  }
  
  // 上传文件
  async function uploadFile(file: File) {
    loading = true
    
    try {
      // 先创建本地预览
      previewUrl = URL.createObjectURL(file)
      
      if (!uploadUrl && !presignUrl) {
        // 没有上传地址，只做本地预览
        value = previewUrl
        onchange?.(previewUrl)
        return
      }
      
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
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }),
        })
        
        if (!presignResponse.ok) {
          throw new Error(mergedLabels.getUploadUrlFailed)
        }
        
        const data = await presignResponse.json()
        targetUrl = data.url
      }
      
      // 上传文件
      const response = await fetch(targetUrl!, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          ...headers,
        },
        body: file,
      })
      
      if (!response.ok) {
        throw new Error(mergedLabels.uploadFailed)
      }
      
      // 获取最终 URL
      let finalUrl = targetUrl!.split('?')[0] // 移除签名参数
      
      try {
        const data = await response.json()
        if (data.url) {
          finalUrl = data.url
        }
      } catch {
        // 响应不是 JSON，使用 targetUrl
      }
      
      value = finalUrl
      previewUrl = finalUrl
      onchange?.(finalUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : mergedLabels.uploadFailed
      onerror?.(message)
      // 清除预览
      previewUrl = ''
      value = ''
    } finally {
      loading = false
    }
  }
  
  function handleClick() {
    if (!disabled) {
      inputElement?.click()
    }
  }
  
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    if (file) {
      const error = validateFile(file)
      if (error) {
        onerror?.(error)
        return
      }
      uploadFile(file)
    }
    e.currentTarget.value = ''
  }
  
  function handleRemove(e: MouseEvent) {
    e.stopPropagation()
    value = ''
    previewUrl = ''
    onchange?.('')
  }
</script>

<div
  class={containerClass}
  style={containerStyle}
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  <input
    bind:this={inputElement}
    type="file"
    {accept}
    {disabled}
    class="hidden"
    onchange={handleChange}
  />
  
  {#if previewUrl}
    <!-- 预览图 -->
    <img
      src={previewUrl}
      alt={mergedLabels.previewAlt}
      class="w-full h-full object-cover"
    />
    
    <!-- 遮罩层 -->
    {#if !disabled}
      <div class="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        {#if loading}
          <span class="loading loading-spinner loading-md text-white"></span>
        {:else}
          <button
            type="button"
            class="btn btn-circle btn-sm btn-ghost text-white"
            onclick={handleClick}
            aria-label={mergedLabels.changeImage}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            type="button"
            class="btn btn-circle btn-sm btn-ghost text-white"
            onclick={handleRemove}
            aria-label={mergedLabels.deleteImage}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- 占位符 -->
    <div class="w-full h-full flex flex-col items-center justify-center text-base-content/50 p-4">
      {#if loading}
        <span class="loading loading-spinner loading-lg"></span>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="text-sm text-center">{placeholder || mergedLabels.placeholder}</span>
        <span class="text-xs mt-1">{mergedLabels.maxSizeHint} {formatSize(maxSize)}</span>
      {/if}
    </div>
  {/if}
</div>
