/**
 * 语音合成端点：校验文本后返回可直接播放的 WAV 音频。
 * @module routes/api/tts/+server
 */

import { TtsRequestSchema } from '$lib/ai-lab-types.js'
import { synthesizeSpeech } from '$lib/server/ai-lab.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request }) => {
  const input = await kit.validate.body(request, TtsRequestSchema)
  const result = await synthesizeSpeech(input)
  if (!result.success)
    return kit.response.fromError(result.error)

  return new Response(result.data.data.slice().buffer, {
    headers: {
      'Content-Type': result.data.format === 'wav' ? 'audio/wav' : 'application/octet-stream',
      'X-Audio-Format': result.data.format,
      ...(result.data.sampleRate ? { 'X-Audio-Sample-Rate': String(result.data.sampleRate) } : {}),
    },
  })
})
