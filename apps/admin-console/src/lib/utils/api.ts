/**
 * =============================================================================
 * Admin Console - API 请求工具
 * =============================================================================
 * 使用 kit.client.create 创建统一客户端：
 * - 自动附加 CSRF Token
 * - 同源 fetch transport 由根 +layout.svelte 调用 kit.client.installBrowserTransport 统一安装
 * =============================================================================
 */

import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

/**
 * 统一 API 客户端：自动 CSRF + 传输加密
 *
 * 写方法（POST / PUT / DELETE 等）自动读取 `hai_csrf` Cookie
 * 并设置 `X-CSRF-Token` 请求头；请求/响应体加解密由浏览器全局
 * transport fetch 包装统一处理。
 *
 * @example
 * ```ts
 * const response = await apiFetch('/api/iam/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(data),
 * })
 * ```
 */
const client = kit.client.create({
  // 只有会话失效才需要UI，普通请求观察器不应在导入时加载Svelte组件。
  recoverSession: async () => {
    const { sessionRecovery } = await import('$lib/services/session-recovery.svelte.js')
    return sessionRecovery.recover()
  },
})

const observers = new Set<(record: Record<string, unknown>) => void>()

/** 只保留请求元数据及有界响应包络的成功/错误码，不记录 Cookie、header 或正文。 */
export function observeAdminRequests(observer: (record: Record<string, unknown>) => void): () => void {
  observers.add(observer)
  return () => observers.delete(observer)
}

export const apiFetch: ReturnType<typeof kit.client.create>['apiFetch'] = async (input, init, options) => {
  const rawUrl = input instanceof Request ? input.url : String(input)
  const requestId = core.id.uuid()
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('X-Request-Id', requestId)
  const started = Date.now()
  let status: number | undefined
  let observingResponse = false
  const excluded = rawUrl.includes('/feedback/')
  const metadata = () => ({ requestId, url: rawUrl.split(/[?#]/)[0], method: init?.method ?? (input instanceof Request ? input.method : 'GET'), timestamp: started, duration: Date.now() - started, status: status ?? null })
  try {
    const response = await client.apiFetch(input, { ...init, headers }, options)
    status = response.status
    if (!excluded) {
      observingResponse = true
      // 旁路读取有界副本，不延迟业务响应，也不消费调用方的原始 body。
      if (response.headers.get('content-type')?.includes('application/json'))
        void observeResponse(response.clone(), metadata())
      else
        notify({ ...metadata(), success: response.ok })
    }
    return response
  }
  finally {
    if (!excluded && !observingResponse)
      notify({ ...metadata(), success: false, errorCode: 'network-error' })
  }
}

async function observeResponse(response: Response, metadata: Record<string, unknown>): Promise<void> {
  let businessSuccess = response.ok
  let errorCode: string | number | undefined
  const reader = response.body?.getReader()
  try {
    if (reader && response.headers.get('content-type')?.includes('application/json')) {
      const decoder = new TextDecoder()
      let bytes = 0
      let text = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        bytes += chunk.value.byteLength
        if (bytes > 64 * 1024) {
          void reader.cancel().catch(() => undefined)
          return
        }
        text += decoder.decode(chunk.value, { stream: true })
      }
      const body: unknown = JSON.parse(text + decoder.decode())
      if (body && typeof body === 'object' && 'success' in body && body.success === false) {
        businessSuccess = false
        if ('error' in body && body.error && typeof body.error === 'object' && 'code' in body.error && (typeof body.error.code === 'string' || typeof body.error.code === 'number'))
          errorCode = body.error.code
      }
    }
  }
  catch { /* 非 JSON、取消与解析失败只影响补充信息。 */ }
  finally {
    reader?.releaseLock()
    notify({ ...metadata, success: businessSuccess, ...(errorCode === undefined ? {} : { errorCode }) })
  }
}

function notify(data: Record<string, unknown>): void {
  for (const observer of observers) {
    try {
      observer(data)
    }
    catch { /* 观察失败不能改变业务请求。 */ }
  }
}
