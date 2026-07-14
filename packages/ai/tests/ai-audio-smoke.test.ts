/**
 * ai.audio — 真实接口 Smoke Test（默认跳过）
 *
 * 通过环境变量 `HAI_AI_AUDIO_SMOKE=1` 显式启用，用于定期验证真实厂商接口可用性与协议变化。
 * 不进入普通 PR 门禁，避免消耗额度和引入外部网络不稳定性。
 *
 * 启用示例（合成一句话为音频）：
 *   HAI_AI_AUDIO_SMOKE=1 \
 *   HAI_AI_AUDIO_SMOKE_PROVIDER=qwen \
 *   HAI_AI_AUDIO_SMOKE_TTS_MODEL=qwen3-tts-flash-realtime \
 *   DASHSCOPE_API_KEY=sk-xxx \
 *   pnpm --filter @h-ai/ai test ai-audio-smoke
 */

import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { ai } from '../src/index.js'

const enabled = process.env.HAI_AI_AUDIO_SMOKE === '1'
const provider = process.env.HAI_AI_AUDIO_SMOKE_PROVIDER as 'openai' | 'mimo' | 'qwen' | 'doubao' | undefined
const ttsModel = process.env.HAI_AI_AUDIO_SMOKE_TTS_MODEL

describe.skipIf(!enabled || !provider || !ttsModel)('ai.audio smoke（真实接口）', () => {
  afterAll(async () => {
    await ai.close()
  })

  it('synthesize 返回非空音频', async () => {
    const init = await ai.init({
      audio: {
        models: [{ id: 'tts', provider: provider!, model: ttsModel!, operations: ['synthesize'] }],
        synthesizeModel: 'tts',
      },
    })
    expect(init.success).toBe(true)

    const result = await ai.audio.synthesize({ text: '你好，这是一次语音合成测试。', format: 'pcm16' })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.data.length).toBeGreaterThan(0)
  })
})
