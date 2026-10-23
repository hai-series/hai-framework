import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as upload } from '../src/routes/api/asr/+server.js'
import { POST as stream } from '../src/routes/api/asr/stream/+server.js'

const mocks = vi.hoisted(() => ({ transcribe: vi.fn(), stream: vi.fn() }))
vi.mock('../src/lib/server/ai-lab.js', () => ({
  transcribeSpeech: mocks.transcribe,
  transcribeSpeechStream: mocks.stream,
}))

beforeEach(() => {
  mocks.transcribe.mockReset().mockResolvedValue({ success: true, data: { text: 'こんにちは' } })
  mocks.stream.mockReset().mockImplementation(async function* () {
    yield { type: 'transcript', text: 'こんにちは', final: true }
  })
})

function event(language: string): Parameters<typeof upload>[0] {
  const form = new FormData()
  form.set('audio', new File([new Uint8Array([1, 2, 3])], 'voice.wav', { type: 'audio/wav' }))
  form.set('language', language)
  return {
    request: new Request('http://localhost/api/asr', { method: 'POST', body: form }),
    locals: { locale: 'ja-JP' },
  } as Parameters<typeof upload>[0]
}

describe.each([{ handler: upload, name: 'upload' }, { handler: stream, name: 'stream' }])('japanese ASR $name', ({ handler, name }) => {
  it('accepts Japanese and forwards the language hint to the audio service', async () => {
    const response = await handler(event('ja'))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('こんにちは')
    expect(name === 'upload' ? mocks.transcribe : mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ language: 'ja', format: 'wav' }))
  })

  it('rejects unsupported language hints with Japanese feedback', async () => {
    const response = await handler(event('unsupported'))
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('日本語')
    expect(mocks.transcribe).not.toHaveBeenCalled()
    expect(mocks.stream).not.toHaveBeenCalled()
  })
})
