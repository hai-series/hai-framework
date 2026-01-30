/**
 * =============================================================================
 * @hai/kit - Client 模块导出
 * =============================================================================
 * Svelte 客户端功能
 *
 * 包含：
 * - useSession - 会话状态管理
 * - useUpload - 文件上传状态管理
 * - useIsAuthenticated - 认证状态派生 store
 * - useUser - 用户信息派生 store
 * =============================================================================
 */

// 类型
export type {
  ClientUser,
  SessionState,
  SessionStore,
  UploadFile,
  UploadOptions,
  UploadState,
  UploadStore,
  UseSessionOptions,
  UseUploadOptions,
} from './client-types.js'

// Stores
export { useIsAuthenticated, useSession, useUpload, useUser } from './stores.js'
