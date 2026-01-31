/**
 * =============================================================================
 * @hai/kit - Client Stores
 * =============================================================================
 * Svelte 客户端 Store 封装
 *
 * 功能：
 * - useSession - 会话状态管理
 * - useUpload - 文件上传状态管理
 *
 * @example
 * ```svelte
 * <script>
 * import { useSession } from '@hai/kit/client'
 *
 * const session = useSession()
 * </script>
 *
 * {#if $session.user}
 *     <p>欢迎, {$session.user.username}</p>
 * {/if}
 * ```
 * =============================================================================
 */

import type {
  SessionState,
  SessionStore,
  UploadFile,
  UploadOptions,
  UploadState,
  UploadStore,
  UseSessionOptions,
  UseUploadOptions,
} from './client-types.js'
import { derived, get, writable } from 'svelte/store'
import { getKitMessage } from '../index.js'

/**
 * 创建会话 Store
 */
export function useSession(options: UseSessionOptions = {}): SessionStore {
  const {
    fetchUrl = '/api/session',
    refreshInterval = 0,
    onSessionChange,
  } = options

  const state = writable<SessionState>({
    user: null,
    loading: true,
    error: null,
  })

  let refreshTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 获取会话
   */
  async function fetch(): Promise<void> {
    state.update(s => ({ ...s, loading: true, error: null }))

    try {
      const response = await globalThis.fetch(fetchUrl)

      if (!response.ok) {
        if (response.status === 401) {
          state.set({ user: null, loading: false, error: null })
          return
        }
        throw new Error(`获取会话失败: ${response.status}`)
      }

      const data = await response.json()
      const prevState = get(state)
      const newUser = data.user || null

      state.set({ user: newUser, loading: false, error: null })

      // 触发回调
      if (prevState.user?.id !== newUser?.id) {
        onSessionChange?.(newUser)
      }
    }
    catch (error) {
      state.update(s => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : '获取会话失败',
      }))
    }
  }

  /**
   * 登出
   */
  async function logout(logoutUrl = '/api/logout'): Promise<void> {
    try {
      await globalThis.fetch(logoutUrl, { method: 'POST' })
      state.set({ user: null, loading: false, error: null })
      onSessionChange?.(null)
    }
    catch (error) {
      state.update(s => ({
        ...s,
        error: error instanceof Error ? error.message : '登出失败',
      }))
    }
  }

  /**
   * 刷新会话
   */
  async function refresh(): Promise<void> {
    await fetch()
  }

  /**
   * 启动自动刷新
   */
  function startAutoRefresh(interval: number): void {
    stopAutoRefresh()
    refreshTimer = setInterval(refresh, interval * 1000)
  }

  /**
   * 停止自动刷新
   */
  function stopAutoRefresh(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  // 初始化
  fetch()

  // 启动自动刷新
  if (refreshInterval > 0) {
    startAutoRefresh(refreshInterval)
  }

  return {
    subscribe: state.subscribe,
    fetch,
    refresh,
    logout,
    startAutoRefresh,
    stopAutoRefresh,
  }
}

/**
 * 创建上传 Store
 */
export function useUpload(options: UseUploadOptions = {}): UploadStore {
  const {
    uploadUrl = '/api/storage',
    presignUrl,
    maxConcurrent = 3,
    onProgress,
    onComplete,
    onError,
  } = options

  const state = writable<UploadState>({
    files: [],
    uploading: false,
    progress: 0,
  })

  let queue: UploadFile[] = []
  let activeCount = 0

  /**
   * 添加文件
   */
  function addFiles(files: File[], uploadOptions?: UploadOptions): void {
    const newFiles: UploadFile[] = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      status: 'pending' as const,
      options: uploadOptions,
    }))

    state.update(s => ({
      ...s,
      files: [...s.files, ...newFiles],
    }))

    queue.push(...newFiles)
    processQueue()
  }

  /**
   * 处理上传队列
   */
  async function processQueue(): Promise<void> {
    if (activeCount >= maxConcurrent || queue.length === 0) {
      return
    }

    const file = queue.shift()
    if (!file)
      return

    activeCount++
    state.update(s => ({ ...s, uploading: true }))

    try {
      await uploadFile(file)
    }
    finally {
      activeCount--

      // 更新整体状态
      const currentState = get(state)
      const allCompleted = currentState.files.every(
        f => f.status === 'completed' || f.status === 'error',
      )

      if (allCompleted) {
        state.update(s => ({ ...s, uploading: false }))
      }

      processQueue()
    }
  }

  /**
   * 上传单个文件
   */
  async function uploadFile(uploadFile: UploadFile): Promise<void> {
    updateFileStatus(uploadFile.id, 'uploading')

    try {
      let url = uploadUrl
      let method = 'POST'
      let body: FormData | File = new FormData()

      // 使用预签名 URL
      if (presignUrl) {
        const presignResponse = await globalThis.fetch(
          `${presignUrl}?filename=${encodeURIComponent(uploadFile.file.name)}&contentType=${encodeURIComponent(uploadFile.file.type)}`,
        )

        if (!presignResponse.ok) {
          throw new Error(getKitMessage('kit_presignFetchFailed'))
        }

        const presignData = await presignResponse.json()
        url = presignData.url
        method = 'PUT'
        body = uploadFile.file
      }
      else {
        (body as FormData).append('file', uploadFile.file)
      }

      // 使用 XMLHttpRequest 来获取进度
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            updateFileProgress(uploadFile.id, progress)
            onProgress?.(uploadFile.id, progress)
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            let result
            try {
              result = JSON.parse(xhr.responseText)
            }
            catch {
              result = { url }
            }

            updateFileStatus(uploadFile.id, 'completed', result)
            onComplete?.(uploadFile.id, result)
            resolve()
          }
          else {
            const error = new Error(`上传失败: ${xhr.status}`)
            updateFileStatus(uploadFile.id, 'error', undefined, error.message)
            onError?.(uploadFile.id, error)
            reject(error)
          }
        })

        xhr.addEventListener('error', () => {
          const error = new Error('网络错误')
          updateFileStatus(uploadFile.id, 'error', undefined, error.message)
          onError?.(uploadFile.id, error)
          reject(error)
        })

        xhr.open(method, url)

        if (body instanceof File) {
          xhr.setRequestHeader('Content-Type', body.type)
        }

        xhr.send(body)
      })
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '上传失败'
      updateFileStatus(uploadFile.id, 'error', undefined, errorMessage)
      onError?.(uploadFile.id, error instanceof Error ? error : new Error(errorMessage))
    }
  }

  /**
   * 更新文件进度
   */
  function updateFileProgress(id: string, progress: number): void {
    state.update(s => ({
      ...s,
      files: s.files.map(f =>
        f.id === id ? { ...f, progress } : f,
      ),
      progress: calculateOverallProgress(s.files),
    }))
  }

  /**
   * 更新文件状态
   */
  function updateFileStatus(
    id: string,
    status: UploadFile['status'],
    result?: unknown,
    error?: string,
  ): void {
    state.update(s => ({
      ...s,
      files: s.files.map(f =>
        f.id === id
          ? { ...f, status, progress: status === 'completed' ? 100 : f.progress, result, error }
          : f,
      ),
    }))
  }

  /**
   * 计算整体进度
   */
  function calculateOverallProgress(files: UploadFile[]): number {
    if (files.length === 0)
      return 0
    const total = files.reduce((sum, f) => sum + f.progress, 0)
    return Math.round(total / files.length)
  }

  /**
   * 移除文件
   */
  function removeFile(id: string): void {
    queue = queue.filter(f => f.id !== id)
    state.update(s => ({
      ...s,
      files: s.files.filter(f => f.id !== id),
    }))
  }

  /**
   * 重试上传
   */
  function retryFile(id: string): void {
    const currentState = get(state)
    const file = currentState.files.find(f => f.id === id)

    if (file && file.status === 'error') {
      updateFileStatus(id, 'pending')
      queue.push(file)
      processQueue()
    }
  }

  /**
   * 清空所有文件
   */
  function clear(): void {
    queue = []
    state.set({
      files: [],
      uploading: false,
      progress: 0,
    })
  }

  /**
   * 取消上传（仅停止队列，已开始的无法取消）
   */
  function cancel(): void {
    queue = []
    state.update(s => ({
      ...s,
      files: s.files.map(f =>
        f.status === 'pending' ? { ...f, status: 'error' as const, error: '已取消' } : f,
      ),
      uploading: false,
    }))
  }

  return {
    subscribe: state.subscribe,
    addFiles,
    removeFile,
    retryFile,
    clear,
    cancel,
  }
}

/**
 * 派生的便捷 store
 */
export function useIsAuthenticated(sessionStore: SessionStore) {
  return derived(sessionStore, $session => !!$session.user)
}

export function useUser(sessionStore: SessionStore) {
  return derived(sessionStore, $session => $session.user)
}
