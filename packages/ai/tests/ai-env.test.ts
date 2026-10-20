import { afterEach, expect, it, vi } from 'vitest'
import { AudioConfigSchema, ImageConfigSchema, LLMConfigSchema, resolveAudioModel, resolveImageModel, resolveModelEntry } from '../src/ai-config.js'

afterEach(() => vi.unstubAllEnvs())

it('公共环境文件中的空凭据不屏蔽厂商回退，本机标准变量可覆盖厂商变量', () => {
  vi.stubEnv('OPENAI_API_KEY', 'vendor-test-key')
  vi.stubEnv('HAI_AI_LLM_APIKEY', '')
  vi.stubEnv('HAI_AI_AUDIO_OPENAI_APIKEY', '   ')
  vi.stubEnv('HAI_AI_IMAGE_OPENAI_APIKEY', '')
  const audio = AudioConfigSchema.parse({ transcribeModel: 'asr', models: [{ id: 'asr', provider: 'openai', model: 'whisper-1', operations: ['transcribe'] }] })
  const image = ImageConfigSchema.parse({ generateModel: 'image', models: [{ id: 'image', provider: 'openai', model: 'gpt-image-1' }] })
  expect(resolveModelEntry(LLMConfigSchema.parse({}), 'chat')).toMatchObject({ success: true, data: { apiKey: 'vendor-test-key' } })
  expect(resolveAudioModel(audio, 'transcribe')).toMatchObject({ success: true, data: { apiKey: 'vendor-test-key' } })
  expect(resolveImageModel(image)).toMatchObject({ success: true, data: { apiKey: 'vendor-test-key' } })
  vi.stubEnv('HAI_AI_LLM_APIKEY', 'machine-test-key')
  expect(resolveModelEntry(LLMConfigSchema.parse({}), 'chat')).toMatchObject({ success: true, data: { apiKey: 'machine-test-key' } })
})
