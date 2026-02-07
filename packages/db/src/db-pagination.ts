/**
 * =============================================================================
 * @hai/db - 分页工具
 * =============================================================================
 *
 * 数据库无关的分页参数规范化与结果构建工具。
 *
 * @module db-pagination
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptions, PaginationOptionsInput } from '@hai/core'
import type { NormalizedPagination, PaginationOverrides } from './db-types.js'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
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
 */
export const pagination = {
  normalize: normalizePagination,
  build: buildPaginatedResult,
}
