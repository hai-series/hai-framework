/**
 * AI 实验台客户端服务层
 *
 * 组件通过本模块调用后端 `/api/*` 端点（fetch 封装），统一处理 HaiResult 响应信封与错误。
 * 是浏览器端唯一的网络访问入口（组件不直接 fetch），业务响应类型复用 `ai-lab-types`。
 * @module services/ai-lab
 */

import type { ChatReply, LabMessage, LabStatus, MemoryView, RememberResult } from '$lib/ai-lab-types.js'

/** API 错误负载（HaiResult 序列化后的 error 字段） */
interface ApiErrorPayload {
  code: string
  message: string
}

/** 统一 API 响应信封：`{ success, data?, error? }` */
interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: ApiErrorPayload
}

/** 客户端请求错误：携带后端错误码，供组件映射提示文案 */
export class LabRequestError extends Error {
  constructor(
    message: string,
    readonly code = 'REQUEST_FAILED',
  ) {
    super(message)
    this.name = 'LabRequestError'
  }
}

/** 发送请求并解析 JSON 信封；非成功响应抛出 LabRequestError */
async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const envelope = await response.json() as ApiEnvelope<T>
  if (!response.ok || !envelope.success || envelope.data === undefined)
    throw new LabRequestError(envelope.error?.message ?? `HTTP ${response.status}`, envelope.error?.code)
  return envelope.data
}

/** 构造 JSON 请求体的 RequestInit */
function jsonRequest(method: 'POST' | 'DELETE', body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

/** 加载能力状态（模型、音色、连接状态） */
export function loadStatus(): Promise<LabStatus> {
  return requestJson('/api/status')
}

/** 发送流式对话请求；`onText` 接收持续修订的当前完整回复。 */
export async function sendChat(input: {
  profileId: string
  sessionId: string
  messages: LabMessage[]
  useMemory: boolean
}, onText: (text: string) => void, signal?: AbortSignal): Promise<ChatReply> {
  const response = await fetch('/api/chat/stream', {
    ...jsonRequest('POST', input),
    signal,
  })
  if (!response.ok || !response.body) {
    const envelope = await response.json().catch(() => undefined) as ApiEnvelope<never> | undefined
    throw new LabRequestError(envelope?.error?.message ?? `HTTP ${response.status}`, envelope?.error?.code)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''

  const consumeLine = (line: string) => {
    if (!line)
      return
    const event = JSON.parse(line) as { text?: string, final?: boolean, error?: boolean }
    if (event.error)
      throw new LabRequestError('LLM chat stream failed', 'LLM_STREAM_ERROR')
    if (typeof event.text === 'string') {
      reply = event.text
      if (reply)
        onText(reply)
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      consumeLine(buffer.slice(0, newlineIndex).trim())
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  }
  buffer += decoder.decode()
  consumeLine(buffer.trim())
  return { reply }
}

/** 从一轮对话中提取长期记忆，返回新增/更新条数（客户端在展示回复后后台调用） */
export function rememberExchange(input: {
  profileId: string
  userMessage: string
  assistantMessage: string
}, signal?: AbortSignal): Promise<RememberResult> {
  return requestJson('/api/chat/remember', { ...jsonRequest('POST', input), signal })
}

/** 语音合成：文本 → WAV 音频 Blob */
export async function synthesize(input: {
  text: string
  voice?: string
  instruction?: string
}): Promise<Blob> {
  const response = await fetch('/api/tts', jsonRequest('POST', input))
  if (!response.ok) {
    const envelope = await response.json() as ApiEnvelope<never>
    throw new LabRequestError(envelope.error?.message ?? `HTTP ${response.status}`, envelope.error?.code)
  }
  return response.blob()
}

/** 语音识别（一次性）：上传音频文件返回识别文本 */
export function transcribe(file: File, language: 'auto' | 'zh' | 'en'): Promise<{ text: string }> {
  const formData = new FormData()
  formData.set('audio', file)
  formData.set('language', language)
  return requestJson('/api/asr', { method: 'POST', body: formData })
}

/** 检索当前主体的记忆（留空 query 列出全部） */
export function loadMemories(profileId: string, query = ''): Promise<MemoryView[]> {
  const params = new URLSearchParams({ profileId, query })
  return requestJson(`/api/memories?${params}`)
}

/** 手动添加一条记忆 */
export function createMemory(input: {
  profileId: string
  content: string
  type: MemoryView['type']
  importance: number
}): Promise<MemoryView> {
  return requestJson('/api/memories', jsonRequest('POST', input))
}

/** 删除一条记忆（校验主体归属） */
export async function deleteMemory(profileId: string, memoryId: string): Promise<void> {
  const params = new URLSearchParams({ profileId })
  const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}?${params}`, { method: 'DELETE' })
  if (response.status === 204)
    return
  const envelope = await response.json() as ApiEnvelope<void>
  if (!response.ok || !envelope.success)
    throw new LabRequestError(envelope.error?.message ?? `HTTP ${response.status}`, envelope.error?.code)
}

/** 清空当前主体的全部记忆 */
export async function clearMemories(profileId: string): Promise<void> {
  const params = new URLSearchParams({ profileId })
  const response = await fetch(`/api/memories?${params}`, { method: 'DELETE' })
  const envelope = await response.json() as ApiEnvelope<void>
  if (!response.ok || !envelope.success)
    throw new LabRequestError(envelope.error?.message ?? `HTTP ${response.status}`, envelope.error?.code)
}
