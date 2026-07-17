/**
 * 流式语音识别端点：multipart 上传 WAV/MP3，以 NDJSON 逐行返回渐进式转写文本。
 *
 * 用于麦克风示例的「实时」文字展示：每行一个 JSON，`{ text }` 为当前完整识别文本
 * （逐步修订，客户端直接覆盖显示），末行 `{ final: true }` 标记结束，出错时输出 `{ error: true }`。
 * @module routes/api/asr/stream/+server
 */

import { MAX_AUDIO_BYTES } from '$lib/ai-lab-types.js'
import * as m from '$lib/paraglide/messages.js'
import { transcribeSpeechStream } from '$lib/server/ai-lab.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

/** MIME → 音频容器格式映射（MiMo ASR 仅支持 wav/mp3） */
const AUDIO_FORMATS = new Map<string, 'wav' | 'mp3'>([
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
])

export const POST = kit.handler(async ({ request }) => {
  const formData = await request.formData()
  const file = formData.get('audio')
  const language = String(formData.get('language') ?? 'auto')

  if (!(file instanceof File))
    return kit.response.badRequest(m.asr_error_file_required())
  if (file.size === 0 || file.size > MAX_AUDIO_BYTES)
    return kit.response.badRequest(m.asr_error_file_size())
  const format = AUDIO_FORMATS.get(file.type)
  if (!format)
    return kit.response.badRequest(m.asr_error_file_type())
  if (!['auto', 'zh', 'en'].includes(language))
    return kit.response.badRequest(m.asr_error_language())

  const data = new Uint8Array(await file.arrayBuffer())
  const events = transcribeSpeechStream({ data, format, language: language === 'auto' ? undefined : language })
  const encoder = new TextEncoder()

  // 逐个转写事件以 NDJSON 推送；异步迭代抛错时输出错误标记行并正常结束流
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          if (event.type === 'transcript')
            controller.enqueue(encoder.encode(`${JSON.stringify({ text: event.text, final: event.final })}\n`))
        }
      }
      catch (error) {
        core.logger.warn('ASR stream failed', { error: error instanceof Error ? error.message : String(error) })
        controller.enqueue(encoder.encode(`${JSON.stringify({ error: true })}\n`))
      }
      finally {
        controller.close()
      }
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
