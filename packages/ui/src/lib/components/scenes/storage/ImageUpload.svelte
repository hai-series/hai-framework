<!--
  =============================================================================
  @h-ai/ui - ImageUpload 组件
  =============================================================================
  图片上传组件，支持预览

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 primitives 组件：IconButton, Spinner
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import type { ImageUploadProps } from '../types.js'
  import { uiM } from '../../../messages.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import BareInput from '../../primitives/BareInput.svelte'
  import IconButton from '../../primitives/IconButton.svelte'
  import Spinner from '../../primitives/Spinner.svelte'

  const SAFE_HTTP_URL_REGEX = /^https?:\/\//i
  const SAFE_RELATIVE_URL_REGEX = /^(?:\/(?!\/)|\.\.?\/)/

  let {
    value = $bindable(''),
    accept = 'image/*',
    maxSize = 5 * 1024 * 1024, // 5MB
    disabled = false,
    uploadHandler,
    placeholder,
    aspectRatio = '',
    width = '',
    height = '',
    class: className = '',
    onchange,
    onerror,
    ...restProps
  }: ImageUploadProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let loading = $state(false)
  let inputElement = $state<HTMLInputElement | undefined>(undefined)
  let activeUpload: AbortController | null = null
  let localPreviewUrl: string | null = null
  let previewUrl = $derived(value)

  const containerClass = $derived(
    cn(
      'image-upload relative overflow-hidden rounded-lg border-2 border-dashed transition-colors',
      !disabled && 'cursor-pointer hover:border-primary',
      disabled && 'opacity-50 cursor-not-allowed',
      previewUrl ? 'border-transparent' : 'border-base-300',
      className,
    ),
  )

  const containerStyle = $derived(
    [
      width && `width: ${width}`,
      height && `height: ${height}`,
      aspectRatio && `aspect-ratio: ${aspectRatio}`,
      !width && !height && !aspectRatio && 'width: 200px; height: 200px',
    ].filter(Boolean).join('; '),
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
      return `${uiM('image_upload_size_exceeded')} ${formatSize(maxSize)}）`
    }

    if (!file.type.startsWith('image/')) {
      return uiM('image_upload_invalid_type')
    }

    return null
  }

  function isSafePreviewUrl(url: string): boolean {
    return SAFE_HTTP_URL_REGEX.test(url) || SAFE_RELATIVE_URL_REGEX.test(url)
  }

  $effect(() => {
    return () => {
      activeUpload?.abort()
      if (localPreviewUrl)
        URL.revokeObjectURL(localPreviewUrl)
    }
  })

  // 上传文件
  async function uploadFile(file: File) {
    activeUpload?.abort()
    const controller = new AbortController()
    activeUpload = controller
    loading = true

    // 释放旧的 Blob URL
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl)
      localPreviewUrl = null
    }

    try {
      // 先创建本地预览
      localPreviewUrl = URL.createObjectURL(file)
      previewUrl = localPreviewUrl

      if (!uploadHandler) {
        // 未提供上传处理器时，仅保留本地预览。
        value = previewUrl
        onchange?.(previewUrl)
        return
      }

      const result = await uploadHandler(file, {
        signal: controller.signal,
        onProgress: () => {},
      })
      if (!result.url || !isSafePreviewUrl(result.url)) {
        throw new Error(uiM('image_upload_failed'))
      }

      value = result.url
      // 释放 Blob URL（已有最终 URL）
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl)
        localPreviewUrl = null
      }
      previewUrl = result.url
      onchange?.(result.url)
    }
    catch (error) {
      // 被后续选择替换的请求不得覆盖新请求的预览与 loading 状态。
      if (activeUpload !== controller) {
        return
      }
      const message = error instanceof Error ? error.message : uiM('image_upload_failed')
      onerror?.(message)
      // 清除预览
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl)
        localPreviewUrl = null
      }
      previewUrl = ''
      value = ''
    }
    finally {
      if (activeUpload === controller) {
        activeUpload = null
        loading = false
      }
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
    activeUpload?.abort()
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl)
      localPreviewUrl = null
    }
    value = ''
    previewUrl = ''
    onchange?.('')
  }
</script>

<div {...dataAttributes}
     class={containerClass}
     style={containerStyle}
     role='button'
     tabindex='0'
     onclick={handleClick}
     onkeydown={e => e.key === 'Enter' && handleClick()}
>
  <BareInput
    type='file'
    class='hidden'
    bind:inputRef={inputElement}
    {accept}
    {disabled}
    onchange={handleChange}
  />

  {#if previewUrl}
    <!-- 预览图 -->
    <img
      src={previewUrl}
      alt={uiM('image_upload_preview_alt')}
      class='w-full h-full object-cover'
    />

    <!-- 遮罩层 -->
    {#if !disabled}
      <div class='absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2'>
        {#if loading}
          <Spinner size='md' class='text-white' />
        {:else}
          <IconButton
            size='sm'
            variant='ghost'
            label={uiM('image_upload_change')}
            onclick={handleClick}
            class='text-white'
          >
            <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' />
            </svg>
          </IconButton>
          <IconButton
            size='sm'
            variant='ghost'
            label={uiM('image_upload_delete')}
            onclick={handleRemove}
            class='text-white'
          >
            <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
            </svg>
          </IconButton>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- 占位符 -->
    <div class='w-full h-full flex flex-col items-center justify-center text-base-content/50 p-4'>
      {#if loading}
        <Spinner size='lg' />
      {:else}
        <svg xmlns='http://www.w3.org/2000/svg' class='h-12 w-12 mb-2' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' />
        </svg>
        <span class='text-sm text-center'>{placeholder || uiM('image_upload_placeholder')}</span>
        <span class='text-xs mt-1'>{uiM('image_upload_max_size_hint')} {formatSize(maxSize)}</span>
      {/if}
    </div>
  {/if}
</div>
