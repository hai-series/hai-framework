<!--
  =============================================================================
  @h-ai/ui - AvatarUpload 组件
  =============================================================================
  头像上传组件（圆形）
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { AvatarUploadProps } from '../types.js'
  import { cn } from '../../../utils.js'
  import BareInput from '../../primitives/BareInput.svelte'
  import { uiM } from '../../../messages.js'
  
  let {
    value = $bindable(''),
    size = 'lg',
    accept = 'image/*',
    maxSize = 2 * 1024 * 1024, // 2MB
    disabled = false,
    uploadUrl = '',
    presignUrl = '',
    headers = {},
    fallback = '',
    class: className = '',
    onchange,
    onerror,
  }: AvatarUploadProps = $props()
  
  let loading = $state(false)
  let inputElement = $state<HTMLInputElement | undefined>(undefined)
  
  const sizeClass = $derived({
    xs: 'w-8 h-8',
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32',
    '2xl': 'w-36 h-36',
    '3xl': 'w-40 h-40',
    '4xl': 'w-44 h-44',
  }[size])
  
  const containerClass = $derived(
    cn(
      'avatar-upload relative rounded-full overflow-hidden',
      !disabled && 'cursor-pointer group',
      disabled && 'opacity-50 cursor-not-allowed',
      sizeClass,
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
  
  // 验证文件
  function validateFile(file: File): string | null {
    if (file.size > maxSize) {
      return `${uiM('avatar_upload_size_exceeded')} ${formatSize(maxSize)}）`
    }
    
    if (!file.type.startsWith('image/')) {
      return uiM('avatar_upload_invalid_type')
    }
    
    return null
  }
  
  // 上传文件
  async function uploadFile(file: File) {
    loading = true
    
    try {
      if (!uploadUrl && !presignUrl) {
        // 没有上传地址，创建本地预览
        value = URL.createObjectURL(file)
        onchange?.(value)
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
          throw new Error(uiM('avatar_upload_get_url_failed'))
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
        throw new Error(uiM('avatar_upload_failed'))
      }
      
      // 获取最终 URL
      let finalUrl = targetUrl!.split('?')[0]
      
      try {
        const data = await response.json()
        if (data.url) {
          finalUrl = data.url
        }
      } catch {
        // 响应不是 JSON
      }
      
      value = finalUrl
      onchange?.(finalUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : uiM('avatar_upload_failed')
      onerror?.(message)
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
</script>

<div
  class={containerClass}
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  <BareInput
    type="file"
    class="hidden"
    bind:inputRef={inputElement}
    {accept}
    {disabled}
    onchange={handleChange}
  />
  
  <!-- 头像图片或占位符 -->
  <div class="w-full h-full bg-neutral flex items-center justify-center text-neutral-content">
    {#if value}
      <img
        src={value}
        alt={uiM('avatar_upload_alt')}
        class="w-full h-full object-cover"
      />
    {:else}
      <span class="text-2xl font-bold">
        {fallback || '?'}
      </span>
    {/if}
  </div>
  
  <!-- 遮罩层 -->
  {#if !disabled}
    <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
      {#if loading}
        <span class="loading loading-spinner text-white"></span>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      {/if}
    </div>
  {/if}
</div>
