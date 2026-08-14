/**
 * @h-ai/iam — API Key 类型定义
 *
 * 包含 API Key 实体、创建选项、查询选项等类型。
 * @module iam-authn-apikey-types
 */

import type { HaiResult, PaginatedResult, PaginationOptionsInput } from '@h-ai/core'

// ─── API Key 实体 ───

/**
 * API Key 实体（对外展示）
 *
 * 不含密钥哈希等敏感信息。
 */
export interface ApiKey {
  /** API Key ID */
  id: string
  /** 所属用户 ID */
  userId: string
  /** API Key 名称（用户自定义标识） */
  name: string
  /** 密钥前缀（用于展示，如 'hai_abc1****'） */
  keyPrefix: string
  /** 是否启用 */
  enabled: boolean
  /** 过期时间（null 表示永不过期） */
  expiresAt: Date | null
  /** 创建时间 */
  createdAt: Date
  /** 最后使用时间 */
  lastUsedAt: Date | null
  /** 权限范围 */
  scopes: string[]
}

/**
 * 数据库中存储的 API Key（含哈希）
 */
export interface StoredApiKey extends ApiKey {
  /** 密钥哈希值 */
  keyHash: string
}

// ─── API Key 创建结果 ───

/**
 * 创建 API Key 的返回结果
 *
 * 仅在创建时返回明文密钥，之后无法再获取。
 */
export interface CreateApiKeyResult {
  /** API Key 元数据 */
  apiKey: ApiKey
  /** 明文密钥（仅此一次展示） */
  rawKey: string
}

// ─── API Key 创建选项 ───

/**
 * 创建 API Key 选项
 */
export interface CreateApiKeyOptions {
  /** API Key 名称 */
  name: string
  /** 有效期天数（0 或不传表示永不过期） */
  expirationDays?: number
  /** 权限范围 */
  scopes?: string[]
}

// ─── API Key 查询选项 ───

/** API Key 列表允许的服务端排序字段。 */
export type ApiKeySortField = 'name' | 'createdAt' | 'lastUsedAt' | 'expiresAt'

/** API Key 列表排序方向。 */
export type ApiKeySortDirection = 'asc' | 'desc'

/**
 * API Key 列表查询选项
 */
export interface ListApiKeysOptions extends PaginationOptionsInput {
  /** 搜索关键字（模糊匹配名称与密钥前缀） */
  search?: string
  /** 按启用状态过滤，不传则返回全部 */
  enabled?: boolean
  /** 服务端排序字段；未指定时保持按创建时间倒序的历史行为。 */
  sortBy?: ApiKeySortField
  /** 服务端排序方向；仅在指定 sortBy 时生效，默认 desc。 */
  sortDirection?: ApiKeySortDirection
}

// ─── API Key 操作接口 ───

/**
 * API Key 管理操作接口
 */
export interface ApiKeyOperations {
  /**
   * 创建 API Key
   *
   * @param userId - 用户 ID
   * @param options - 创建选项
   * @returns 成功返回 API Key 元数据和明文密钥
   */
  createApiKey: (userId: string, options: CreateApiKeyOptions) => Promise<HaiResult<CreateApiKeyResult>>

  /**
   * 分页列出用户的 API Key
   *
   * @param userId - 用户 ID
   * @param options - 分页、搜索、过滤与排序选项
   * @returns 分页 API Key 列表（不含密钥哈希）
   */
  listApiKeys: (userId: string, options?: ListApiKeysOptions) => Promise<HaiResult<PaginatedResult<ApiKey>>>

  /**
   * 获取 API Key 详情
   *
   * @param keyId - API Key ID
   * @returns API Key 详情
   */
  getApiKey: (keyId: string) => Promise<HaiResult<ApiKey | null>>

  /**
   * 吊销/删除 API Key
   *
   * @param keyId - API Key ID
   * @returns 操作结果
   */
  revokeApiKey: (keyId: string) => Promise<HaiResult<void>>

  /**
   * 验证 API Key 并返回关联用户 ID
   *
   * @param rawKey - 明文 API Key
   * @returns 成功返回 API Key 实体（含用户 ID），失败返回错误码
   */
  verifyApiKey: (rawKey: string) => Promise<HaiResult<ApiKey>>
}
