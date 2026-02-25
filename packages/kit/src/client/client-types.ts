/**
 * =============================================================================
 * @h-ai/kit - Client 类型定义
 * =============================================================================
 * 客户端 Store 相关类型
 * =============================================================================
 */

import type { Readable } from 'svelte/store'

/**
 * 用户信息
 */
export interface ClientUser {
  id: string
  username: string
  email?: string
  nickname?: string
  avatar?: string
}

/**
 * 会话状态
 */
export interface SessionState {
  /** 用户信息 */
  user: ClientUser | null
  /** 加载中 */
  loading: boolean
  /** 错误信息 */
  error: string | null
}

/**
 * 会话 Store 接口
 */
export interface SessionStore extends Readable<SessionState> {
  /** 获取会话 */
  fetch: () => Promise<void>
  /** 刷新会话 */
  refresh: () => Promise<void>
  /** 登出 */
  logout: (logoutUrl?: string) => Promise<void>
  /** 启动自动刷新 */
  startAutoRefresh: (interval: number) => void
  /** 停止自动刷新 */
  stopAutoRefresh: () => void
}

/**
 * useSession 配置
 */
export interface UseSessionOptions {
  /** 获取会话的 URL */
  fetchUrl?: string
  /** 自动刷新间隔（秒），0 表示不自动刷新 */
  refreshInterval?: number
  /** 会话变化回调 */
  onSessionChange?: (user: ClientUser | null) => void
}

/**
 * 上传文件状态
 */
export interface UploadFile {
  /** 文件 ID */
  id: string
  /** 原始文件 */
  file: File
  /** 上传进度 (0-100) */
  progress: number
  /** 状态 */
  status: 'pending' | 'uploading' | 'completed' | 'error'
  /** 上传结果 */
  result?: unknown
  /** 错误信息 */
  error?: string
  /** 上传选项 */
  options?: UploadOptions
}

/**
 * 上传选项
 */
export interface UploadOptions {
  /** 自定义文件名 */
  filename?: string
  /** 元数据 */
  metadata?: Record<string, string>
}

/**
 * 上传状态
 */
export interface UploadState {
  /** 文件列表 */
  files: UploadFile[]
  /** 是否正在上传 */
  uploading: boolean
  /** 整体进度 */
  progress: number
}

/**
 * 上传 Store 接口
 */
export interface UploadStore extends Readable<UploadState> {
  /** 添加文件 */
  addFiles: (files: File[], options?: UploadOptions) => void
  /** 移除文件 */
  removeFile: (id: string) => void
  /** 重试上传 */
  retryFile: (id: string) => void
  /** 清空所有文件 */
  clear: () => void
  /** 取消上传 */
  cancel: () => void
}

/**
 * useUpload 配置
 */
export interface UseUploadOptions {
  /** 上传 URL */
  uploadUrl?: string
  /** 预签名 URL（如果使用预签名上传） */
  presignUrl?: string
  /** 最大并发数 */
  maxConcurrent?: number
  /** 进度回调 */
  onProgress?: (fileId: string, progress: number) => void
  /** 完成回调 */
  onComplete?: (fileId: string, result: unknown) => void
  /** 错误回调 */
  onError?: (fileId: string, error: Error) => void
}
