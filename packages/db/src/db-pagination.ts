/**
 * =============================================================================
 * @h-ai/db - 分页工具
 * =============================================================================
 *
 * 数据库无关的分页参数规范化与结果构建工具。
 *
 * @module db-pagination
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptions, PaginationOptionsInput } from '@h-ai/core'
import type { NormalizedPagination, PaginationOverrides } from './db-types.js'

/** 默认起始页码 */
const DEFAULT_PAGE = 1

/** 默认每页数量 */
const DEFAULT_PAGE_SIZE = 20

/** 每页最大允许数量（防止过大分页导致性能问题） */
const MAX_PAGE_SIZE = 200

/**
 * 规范化页码
 *
 * @param value - 原始页码
 * @param fallback - 默认页码
 * @returns 规范化后的页码
 */
function normalizePage(value: number | undefined, fallback: number): number {
  if (!value || value < 1) {
    // 无值或非法时回退到默认页
    return fallback
  }
  return Math.floor(value)
}

/**
 * 规范化每页大小
 *
 * @param value - 原始页大小
 * @param fallback - 默认页大小
 * @param maxSize - 最大页大小
 * @returns 规范化后的页大小
 */
function normalizePageSize(value: number | undefined, fallback: number, maxSize: number): number {
  if (!value || value < 1) {
    // 无值或非法时回退到默认值
    return fallback
  }
  // 限制最大值，避免过大分页
  return Math.min(Math.floor(value), maxSize)
}

/**
 * 规范化分页参数
 *
 * 将用户输入的可选分页参数转换为带有默认值的完整分页对象，
 * 同时计算 SQL 所需的 offset 和 limit。
 *
 * 处理规则：
 * - page < 1 或未提供 → 使用 defaultPage（默认 1）
 * - pageSize < 1 或未提供 → 使用 defaultPageSize（默认 20）
 * - pageSize > maxPageSize → 截断为 maxPageSize（默认 200）
 * - offset = (page - 1) * pageSize
 *
 * @param options - 用户传入的分页参数（可选）
 * @param overrides - 覆盖默认分页参数（可选）
 * @returns 规范化后的分页参数（含 offset、limit）
 *
 * @example
 * ```ts
 * // 使用默认值
 * normalizePagination() // { page: 1, pageSize: 20, offset: 0, limit: 20 }
 *
 * // 自定义分页
 * normalizePagination({ page: 3, pageSize: 10 }) // { page: 3, pageSize: 10, offset: 20, limit: 10 }
 *
 * // 覆盖默认值
 * normalizePagination(undefined, { defaultPageSize: 50, maxPageSize: 100 })
 * ```
 */
export function normalizePagination(
  options?: PaginationOptionsInput,
  overrides?: PaginationOverrides,
): NormalizedPagination {
  const defaultPage = overrides?.defaultPage ?? DEFAULT_PAGE
  const defaultPageSize = overrides?.defaultPageSize ?? DEFAULT_PAGE_SIZE
  const maxPageSize = overrides?.maxPageSize ?? MAX_PAGE_SIZE

  // 计算页码与大小，并推导 offset/limit
  const page = normalizePage(options?.page, defaultPage)
  const pageSize = normalizePageSize(options?.pageSize, defaultPageSize, maxPageSize)
  const offset = (page - 1) * pageSize

  return {
    page,
    pageSize,
    offset,
    limit: pageSize,
  }
}

/**
 * 构建分页结果
 *
 * 将查询结果和分页元数据组装为统一的分页响应结构。
 *
 * @param items - 当前页数据
 * @param total - 总记录数
 * @param pagination - 当前分页参数
 * @returns 标准分页结果对象
 *
 * @example
 * ```ts
 * const result = buildPaginatedResult(
 *   [{ id: 1, name: '张三' }],
 *   100,
 *   { page: 1, pageSize: 20 }
 * )
 * // { items: [...], total: 100, page: 1, pageSize: 20 }
 * ```
 */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  pagination: PaginationOptions,
): PaginatedResult<T> {
  // 直接透传分页元信息
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
}

/**
 * 分页工具集合
 *
 * 提供分页参数规范化与结果构建能力，通过 `db.pagination` 访问。
 *
 * @example
 * ```ts
 * import { db } from '@h-ai/db'
 *
 * const pag = db.pagination.normalize({ page: 2, pageSize: 10 })
 * // pag.offset = 10, pag.limit = 10
 *
 * const result = db.pagination.build(items, total, pag)
 * ```
 */
export const pagination = {
  normalize: normalizePagination,
  build: buildPaginatedResult,
}

// =============================================================================
// 计数解析
// =============================================================================

/**
 * 解析 COUNT 查询返回值
 *
 * 兼容不同驱动/SQL 的列别名与返回类型（`total` / `__total__` / `cnt` / 首列值）。
 * 支持 bigint 类型的安全转换。
 *
 * @param row - 查询返回行（可能为 null/undefined）
 * @returns 解析后的数值，无数据时返回 0
 *
 * @example
 * ```ts
 * parseCount({ cnt: 42 })   // 42
 * parseCount({ total: 10 }) // 10
 * parseCount(null)           // 0
 * ```
 */
export function parseCount(row: Record<string, unknown> | null | undefined): number {
  if (!row) {
    // 无数据默认 0
    return 0
  }
  if ('total' in row) {
    // 常见别名 total
    return Number(row.total ?? 0)
  }
  if ('__total__' in row) {
    // 某些驱动使用 __total__
    return Number(row.__total__ ?? 0)
  }
  if ('cnt' in row) {
    // 默认别名 cnt
    return Number(row.cnt ?? 0)
  }
  const value = Object.values(row)[0]
  if (typeof value === 'bigint') {
    // SQLite/PG bigint 处理
    return Number(value)
  }
  return Number(value ?? 0)
}
