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

function normalizePage(value: number | undefined, fallback: number): number {
  if (!value || value < 1) {
    return fallback
  }
  return Math.floor(value)
}

function normalizePageSize(value: number | undefined, fallback: number, maxSize: number): number {
  if (!value || value < 1) {
    return fallback
  }
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
