/**
 * =============================================================================
 * @h-ai/kit - 表单验证
 * =============================================================================
 * 表单数据验证工具
 * =============================================================================
 */

import type { z } from 'zod'
import type { FormError, FormValidationResult } from './kit-types.js'

// =============================================================================
// 内部工具
// =============================================================================

/** Zod 错误 issue 类型 */
interface ZodIssue {
  path: (string | number)[]
  message: string
}

/** 从 Zod SafeParseError 提取 issues 列表 */
function extractZodIssues(error: z.ZodError): ZodIssue[] {
  // Zod v4 使用 issues，兼容旧版 errors
  const zodError = error as unknown as { issues?: ZodIssue[], errors?: ZodIssue[] }
  return zodError.issues ?? zodError.errors ?? []
}

/** 将 Zod issues 转换为 FormError 列表 */
function zodIssuesToFormErrors(issues: ZodIssue[]): FormError[] {
  return issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))
}

/** 创建验证失败结果 */
function createValidationResult<T>(error: z.ZodError): FormValidationResult<T> {
  return {
    valid: false,
    errors: zodIssuesToFormErrors(extractZodIssues(error)),
  }
}

// =============================================================================
// 公共验证函数
// =============================================================================

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
      return { valid: true, data: result.data, errors: [] }
    }

    return createValidationResult(result.error)
  }
  catch {
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
    return { valid: true, data: result.data, errors: [] }
  }

  return createValidationResult(result.error)
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
    return { valid: true, data: result.data, errors: [] }
  }

  return createValidationResult(result.error)
}
