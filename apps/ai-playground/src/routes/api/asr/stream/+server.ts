/**
 * 流式语音识别端点：multipart 上传 WAV/MP3，以 NDJSON 逐行返回渐进式转写文本。
 *
 * 每行一个 JSON，`{ text }` 为当前完整识别文本
 * （逐步修订，客户端直接覆盖显示），末行 `{ final: true }` 标记结束，出错时输出 `{ error: true }`。
 * @module routes/api/asr/stream/+server
 */

import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { MAX_AUDIO_BYTES } from '#lib/ai-lab-types.js'
import * as m from '#lib/paraglide/messages.js'
import { transcribeSpeechStream } from '#lib/server/ai-lab.js'

/** MIME → 音频容器格式映射（MiMo ASR 仅支持 wav/mp3） */
const AUDIO_FORMATS = new Map<string, 'wav' | 'mp3'>([
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
])

export const POST = kit.handler(async ({ request, locals }) => {
  const locale = locals.locale === 'en-US'
    ? 'en-US'
    : locals.locale === 'ja-JP'
      ? 'ja-JP'
      : 'zh-CN'
  const formData = await request.formData()
  const file = formData.get('audio')
  const language = String(formData.get('language') ?? 'auto')

  if (!(file instanceof File))
    return kit.response.badRequest(m.asr_error_file_required({}, { locale }))
  if (file.size === 0 || file.size > MAX_AUDIO_BYTES)
    return kit.response.badRequest(m.asr_error_file_size({}, { locale }))
  const format = AUDIO_FORMATS.get(file.type)
  if (!format)
    return kit.response.badRequest(m.asr_error_file_type({}, { locale }))
  if (!['auto', 'zh', 'en', 'ja'].includes(language))
    return kit.response.badRequest(m.asr_error_language({}, { locale }))

  const data = new Uint8Array(await file.arrayBuffer())
  const abort = new AbortController()
  const signal = AbortSignal.any([request.signal, abort.signal])
  const events = transcribeSpeechStream({
    data,
    format,
    language: language === 'auto'
      ? undefined
      : language,
    signal,
  })
  const encoder = new TextEncoder()
  const iterator = events[Symbol.asyncIterator]()

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!signal.aborted) {
          const { value, done } = await iterator.next()
          if (signal.aborted)
            break
          if (done) {
            controller.close()
            return
          }
          if (value.type === 'transcript') {
            controller.enqueue(encoder.encode(`${JSON.stringify({ text: value.text, final: value.final })}\n`))
            return
          }
        }
      }
      catch {
        if (!signal.aborted) {
          core.logger.warn('ASR stream failed', { requestId: locals.requestId })
          controller.enqueue(encoder.encode(`${JSON.stringify({ error: true })}\n`))
        }
      }
      if (!abort.signal.aborted)
        controller.close()
      await iterator.return?.().catch(() => undefined)
    },
    async cancel() {
      abort.abort()
      await iterator.return?.().catch(() => undefined)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
