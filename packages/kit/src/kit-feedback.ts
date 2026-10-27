import type { HaiResult } from '@h-ai/core'
/** 可直接挂到 SvelteKit catch-all 路由的反馈适配，无 serv 或 Svelte UI 依赖。 */
import type { FeedbackContext, FeedbackFunctions } from '@h-ai/feedback'
import type { RequestEvent, RequestHandler } from '@sveltejs/kit'
import type { z } from 'zod'
import {
  FeedbackAppendEvidenceInputSchema,
  FeedbackAttachmentQuerySchema,
  FeedbackCompleteInputSchema,
  FeedbackEvidenceQuerySchema,
  FeedbackExportInputSchema,
  FeedbackExportQuerySchema,
  FeedbackIdInputSchema,
  FeedbackListInputSchema,
  FeedbackRetryInputSchema,
  FeedbackSetStatusInputSchema,
  FeedbackSubmitInputSchema,
  FeedbackUploadInputSchema,
} from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { kitM } from './kit-i18n.js'
import { fromError, ok } from './kit-response.js'

/**
 * 反馈服务及可信范围解析。resolveContext 必须使用已验证 session/宿主策略。
 * @example
 * ```ts
 * import type { FeedbackHandlerOptions } from '@h-ai/kit'
 * import { feedback } from '@h-ai/feedback'
 * const options: FeedbackHandlerOptions = { feedback, resolveContext: () => null }
 * // 应用实现真实 session 映射；null 拒绝访问，不能从 JSON 取得身份。
 * ```
 */
export interface FeedbackHandlerOptions {
  readonly feedback: FeedbackFunctions
  readonly resolveContext: (event: RequestEvent) => FeedbackContext | null | Promise<FeedbackContext | null>
  readonly basePath?: string
}

/**
 * 装配反馈 REST 路由；默认路径 /api/feedback，由宿主 handle 保持 CSRF、认证和传输加密。
 * @param options - 已初始化服务与可信范围映射。
 * @returns 可赋值给 catch-all 路由 GET/POST/PATCH 的同一 handler。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 * import { feedback } from '@h-ai/feedback'
 * const handler = kit.createFeedbackHandler({ feedback, resolveContext: () => null })
 * // 路由 export const GET = handler；真实应用从受信 session 返回范围，null 默认拒绝。
 * ```
 */
export function createFeedbackHandler(options: FeedbackHandlerOptions): RequestHandler {
  const basePath = (options.basePath ?? '/api/feedback').replace(/\/+$/, '')
  return async (event) => {
    let actor: FeedbackContext | null
    try {
      actor = await options.resolveContext(event)
    }
    catch {
      return fromError({ ...HaiCommonError.INTERNAL_ERROR, message: kitM('kit_internalError') })
    }
    if (!actor?.scopeId || !actor.userId)
      return fromError({ ...HaiCommonError.UNAUTHORIZED, message: kitM('kit_unauthorized') })
    if (options.feedback.isInitialized === false)
      return fromError({ ...HaiCommonError.SERVICE_UNAVAILABLE, message: kitM('kit_feedbackUnavailable') })
    const suffix = event.url.pathname.startsWith(`${basePath}/`) ? event.url.pathname.slice(basePath.length + 1) : ''
    let parts: string[]
    try {
      parts = suffix.split('/').map(decodeURIComponent)
    }
    catch {
      return invalid(400)
    }
    if (parts.length === 1 && parts[0] === 'policy' && event.request.method === 'GET')
      return ok(options.feedback.budget)
    if (parts[0] !== 'reports' || parts.length > 4)
      return fromError({ ...HaiCommonError.NOT_FOUND, message: core.i18n.coreM('core_errorNotFound') })
    let body: unknown = {}
    if (!['GET', 'HEAD'].includes(event.request.method)) {
      if (event.request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
        return invalid(415)
      try {
        body = await readBoundedJson(event.request, options.feedback.budget.maxTransportBytes)
      }
      catch (error) {
        return invalid(error instanceof RangeError ? 413 : 400)
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return invalid(400)
    const bodyRecord = body as Record<string, unknown>
    if (parts[1] && Object.hasOwn(bodyRecord, 'id') && bodyRecord.id !== parts[1])
      return invalid(400)
    const input = { ...Object.fromEntries(event.url.searchParams), ...bodyRecord, ...(parts[1] ? { id: parts[1] } : {}) }
    const method = event.request.method
    const service = options.feedback
    async function execute<T>(schema: z.ZodType<T>, operation: (value: T) => Promise<HaiResult<unknown>>): Promise<Response> {
      const parsed = schema.safeParse(input)
      if (!parsed.success)
        return invalid(400)
      try {
        const result = await core.context.run(actor!, () => operation(parsed.data))
        return result.success ? ok(result.data) : fromError(result.error)
      }
      catch {
        return fromError({ ...HaiCommonError.INTERNAL_ERROR, message: kitM('kit_internalError') })
      }
    }
    if (parts.length === 1) {
      if (method === 'POST')
        return execute(FeedbackSubmitInputSchema, value => service.submit(value, actor))
      if (method === 'GET')
        return execute(FeedbackListInputSchema, value => service.list(value, actor))
    }
    if (parts.length === 2 && method === 'GET')
      return execute(FeedbackIdInputSchema, value => service.get(value.id, actor))
    if (parts.length === 3) {
      if (parts[2] === 'evidence' && method === 'GET')
        return execute(FeedbackEvidenceQuerySchema, value => service.getEvidence(value, actor))
      if (parts[2] === 'evidence' && method === 'POST')
        return execute(FeedbackAppendEvidenceInputSchema, value => service.appendEvidence(value, actor))
      if (parts[2] === 'status' && method === 'PATCH')
        return execute(FeedbackSetStatusInputSchema, value => service.setStatus(value, actor))
      if (parts[2] === 'retry' && method === 'POST')
        return execute(FeedbackRetryInputSchema, value => service.retry(value, actor))
      if (parts[2] === 'complete' && method === 'POST')
        return execute(FeedbackCompleteInputSchema, value => service.completeCollection(value, actor))
      if (parts[2] === 'exports' && method === 'POST')
        return execute(FeedbackExportInputSchema, value => service.export(value, actor))
    }
    if (parts.length === 4 && parts[2] === 'attachments') {
      Object.assign(input, { attachmentId: parts[3] })
      if (method === 'POST')
        return execute(FeedbackUploadInputSchema, value => service.uploadAttachment(value, actor))
      if (method === 'GET')
        return execute(FeedbackAttachmentQuerySchema, value => service.getAttachment(value, actor))
    }
    if (parts.length === 4 && parts[2] === 'exports' && method === 'GET') {
      Object.assign(input, { jobId: parts[3] })
      return execute(FeedbackExportQuerySchema, value => service.getExport(value, actor))
    }
    return fromError({ ...HaiCommonError.NOT_FOUND, message: core.i18n.coreM('core_errorNotFound') })
  }
}

function invalid(status: number): Response {
  return fromError({ ...HaiCommonError.INVALID_REQUEST, httpStatus: status, message: kitM('kit_validationFailed') })
}

/** 读取时限制实际字节数，不能只信 Content-Length。 */
async function readBoundedJson(request: Request, maximum: number): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader)
    return {}
  const decoder = new TextDecoder()
  let length = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      length += chunk.value.byteLength
      if (length > maximum) {
        await reader.cancel()
        throw new RangeError('Feedback request is too large')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    return text ? JSON.parse(text) : {}
  }
  finally {
    reader.releaseLock()
  }
}
