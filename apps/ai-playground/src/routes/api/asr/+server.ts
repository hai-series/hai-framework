/**
 * 语音识别端点（一次性）：multipart 上传 WAV/MP3，校验后返回转写文本。
 * @module routes/api/asr/+server
 */

import { MAX_AUDIO_BYTES } from '$lib/ai-lab-types.js'
import * as m from '$lib/paraglide/messages.js'
import { transcribeSpeech } from '$lib/server/ai-lab.js'
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
  const result = await transcribeSpeech({ data, format, language })
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})
