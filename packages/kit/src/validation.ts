/**
 * =============================================================================
 * @hai/kit - 表单验证
 * =============================================================================
 * 表单数据验证工具
 * =============================================================================
 */

import type { z } from 'zod'
import type { FormError, FormValidationResult } from './types.js'

/**
 * 从 Request 解析并验证表单数据
 */
export async function validateForm<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<FormValidationResult<z.infer<T>>> {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    let data: unknown

    if (contentType.includes('application/json')) {
      data = await request.json()
    }
    else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      data = Object.fromEntries(formData)
    }
    else {
      return {
        valid: false,
        errors: [{ field: '_', message: 'Unsupported content type' }],
      }
    }

    const result = schema.safeParse(data)

    if (result.success) {
      return {
        valid: true,
        data: result.data,
        errors: [],
      }
    }

    const errors: FormError[] = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }))

    return {
      valid: false,
      errors,
    }
  }
  catch (e) {
    return {
      valid: false,
      errors: [{ field: '_', message: 'Failed to parse request body' }],
    }
  }
}

/**
 * 从 URL 参数验证查询参数
 */
export function validateQuery<T extends z.ZodType>(
  url: URL,
  schema: T,
): FormValidationResult<z.infer<T>> {
  const data = Object.fromEntries(url.searchParams)
  const result = schema.safeParse(data)

  if (result.success) {
    return {
      valid: true,
      data: result.data,
      errors: [],
    }
  }

  const errors: FormError[] = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
  }))

  return {
    valid: false,
    errors,
  }
}

/**
 * 从路径参数验证
 */
export function validateParams<T extends z.ZodType>(
  params: Record<string, string>,
  schema: T,
): FormValidationResult<z.infer<T>> {
  const result = schema.safeParse(params)

  if (result.success) {
    return {
      valid: true,
      data: result.data,
      errors: [],
    }
  }

  const errors: FormError[] = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
  }))

  return {
    valid: false,
    errors,
  }
}
