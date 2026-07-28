/**
 * ai.image — 文生图契约测试
 *
 * 通过公共入口校验统一输入输出，以及各厂商官方 HTTP 请求/响应格式。
 * 所有网络请求均使用 mock，避免测试依赖厂商额度或真实凭据。
 */

import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64')
const JPEG_BYTES = new Uint8Array([255, 216, 255, 224])
const JPEG_BASE64 = Buffer.from(JPEG_BYTES).toString('base64')
const REFERENCE_IMAGES = [
  { data: PNG_BYTES, mimeType: 'image/png' },
  { data: JPEG_BYTES, mimeType: 'image/jpeg' },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function imageResponse(bytes = PNG_BYTES, mimeType = 'image/png'): Response {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': mimeType },
  })
}

async function initImage(model: {
  id: string
  provider: 'openai' | 'google' | 'qwen' | 'seedream' | 'pollinations'
  model: string
  apiKey?: string
  baseUrl?: string
  workspaceId?: string
}): Promise<void> {
  const initialized = await ai.init({
    llm: { apiKey: 'sk-test', model: 'gpt-4o-mini' },
    image: {
      models: [model],
      generateModel: model.id,
    },
  })
  expect(initialized.success).toBe(true)
}

describe('ai.image 公共契约', () => {
  beforeEach(async () => {
    await ai.close()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(async () => {
    await ai.close()
    vi.unstubAllGlobals()
  })

  it('未初始化时返回 NOT_INITIALIZED', async () => {
    const result = await ai.image.generate({ prompt: '一只猫' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
  })

  it('拒绝空提示词', async () => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    const result = await ai.image.generate({ prompt: '   ' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_INVALID_REQUEST.code)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('拒绝未知模型', async () => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    const result = await ai.image.generate({ prompt: '一只猫', model: 'missing' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_MODEL_NOT_FOUND.code)
  })

  it.each([
    { width: 0, height: 1024 },
    { width: 1024, height: -1 },
    { width: 1024.5, height: 1024 },
    { width: Number.NaN, height: 1024 },
  ])('拒绝无效尺寸 $width x $height', async (size) => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    const result = await ai.image.generate({ prompt: '一只猫', size })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_INVALID_REQUEST.code)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('接受省略或传入空参考图数组', async () => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    vi.mocked(fetch).mockImplementation(async () => jsonResponse({ data: [{ b64_json: PNG_BASE64 }], output_format: 'png' }))

    const omitted = await ai.image.generate({ prompt: '一只猫' })
    const empty = await ai.image.generate({ prompt: '一只猫', referenceImages: [] })

    expect(omitted.success).toBe(true)
    expect(empty.success).toBe(true)
    expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual([
      'https://api.openai.com/v1/images/generations',
      'https://api.openai.com/v1/images/generations',
    ])
  })

  it.each([
    { referenceImages: [{ data: new Uint8Array(), mimeType: 'image/png' }] },
    { referenceImages: [{ data: PNG_BYTES, mimeType: '' }] },
    { referenceImages: [{ data: PNG_BYTES, mimeType: 'text/plain' }] },
  ])('拒绝内容为空或 MIME 非图片的参考图', async ({ referenceImages }) => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    const result = await ai.image.generate({ prompt: '一只猫', referenceImages })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_INVALID_REQUEST.code)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('请求前已取消时不调用厂商接口', async () => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    const controller = new AbortController()
    controller.abort()

    const result = await ai.image.generate({ prompt: '一只猫', signal: controller.signal })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_CANCELLED.code)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('ai.image Provider 官方格式', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(async () => {
    await ai.close()
    vi.unstubAllGlobals()
  })

  it('openAI GPT Image 使用 /images/generations 并解析 b64_json', async () => {
    await initImage({ id: 'gpt-image', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      created: 1,
      data: [{ b64_json: PNG_BASE64 }],
      output_format: 'png',
      size: '1024x1024',
    }))

    const result = await ai.image.generate({ prompt: '一只戴围巾的猫', size: { width: 1024, height: 1024 } })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.images[0]?.data).toEqual(PNG_BYTES)
      expect(result.data.images[0]?.mimeType).toBe('image/png')
    }
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/images/generations')
    expect(init?.headers).toMatchObject({ 'Authorization': 'Bearer sk-openai', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gpt-image-2',
      prompt: '一只戴围巾的猫',
      n: 1,
      size: '1024x1024',
      output_format: 'png',
    })
  })

  it('openAI 参考图使用 /images/edits multipart，并保留每张图的 MIME 与字节', async () => {
    await initImage({ id: 'gpt-image', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      data: [{ b64_json: PNG_BASE64 }, { b64_json: JPEG_BASE64 }],
      output_format: 'jpeg',
    }))

    const result = await ai.image.generate({
      prompt: '把两个主体组合在一起',
      referenceImages: REFERENCE_IMAGES,
      size: { width: 1536, height: 1024 },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.images).toHaveLength(2)
      expect(result.data.images[1]).toMatchObject({ data: JPEG_BYTES, mimeType: 'image/jpeg' })
    }
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/images/edits')
    expect(init?.headers).toEqual({ Authorization: 'Bearer sk-openai' })
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('model')).toBe('gpt-image-2')
    expect(form.get('prompt')).toBe('把两个主体组合在一起')
    expect(form.get('n')).toBe('1')
    expect(form.get('size')).toBe('1536x1024')
    expect(form.get('output_format')).toBe('png')
    const images = form.getAll('image[]')
    expect(images).toHaveLength(2)
    expect((images[0] as File).type).toBe('image/png')
    expect((images[1] as File).type).toBe('image/jpeg')
    expect(new Uint8Array(await (images[0] as File).arrayBuffer())).toEqual(PNG_BYTES)
    expect(new Uint8Array(await (images[1] as File).arrayBuffer())).toEqual(JPEG_BYTES)
  })

  it('google Gemini Image 使用 generateContent 并解析 inlineData', async () => {
    await initImage({ id: 'nano-banana', provider: 'google', model: 'gemini-3.1-flash-image', apiKey: 'google-key' })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }],
        },
      }],
    }))

    const result = await ai.image.generate({ prompt: '极简香蕉图标', size: { width: 1024, height: 1024 } })

    expect(result.success).toBe(true)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent')
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'google-key', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({
      contents: [{ parts: [{ text: '极简香蕉图标' }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        responseFormat: {
          image: { aspectRatio: '1:1', imageSize: '1K' },
        },
      },
    })
  })

  it('google 将多张参考图编码为 generateContent inlineData parts', async () => {
    await initImage({ id: 'nano-banana', provider: 'google', model: 'gemini-3.1-flash-image', apiKey: 'google-key' })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: JPEG_BASE64 } }] } }],
    }))

    const result = await ai.image.generate({ prompt: '融合两张参考图', referenceImages: REFERENCE_IMAGES })

    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.images[0]).toMatchObject({ data: JPEG_BYTES, mimeType: 'image/jpeg' })
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect(JSON.parse(String(init?.body))).toEqual({
      contents: [{
        parts: [
          { inlineData: { mimeType: 'image/png', data: PNG_BASE64 } },
          { inlineData: { mimeType: 'image/jpeg', data: JPEG_BASE64 } },
          { text: '融合两张参考图' },
        ],
      }],
      generationConfig: { responseModalities: ['IMAGE'] },
    })
  })

  it('qwen-Image 2.0/3.0 使用 multimodal-generation 并立即下载临时 URL', async () => {
    await initImage({
      id: 'qwen-image',
      provider: 'qwen',
      model: 'qwen-image-3.0-pro',
      apiKey: 'dashscope-key',
      baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1',
    })
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        output: {
          choices: [{
            finish_reason: 'stop',
            message: { role: 'assistant', content: [{ image: 'https://temporary.example/qwen.png' }] },
          }],
        },
        usage: { width: 1024, height: 1024, image_count: 1 },
      }))
      .mockResolvedValueOnce(imageResponse())

    const result = await ai.image.generate({ prompt: '中文海报', size: { width: 1024, height: 1024 } })

    expect(result.success).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'qwen-image-3.0-pro',
      input: {
        messages: [{ role: 'user', content: [{ text: '中文海报' }] }],
      },
      parameters: {
        n: 1,
        size: '1024*1024',
        watermark: false,
      },
    })
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe('https://temporary.example/qwen.png')
  })

  it('qwen 将参考图转换为 data URL，并在其后追加文本 part', async () => {
    await initImage({
      id: 'qwen-image',
      provider: 'qwen',
      model: 'qwen-image-2.0-pro',
      apiKey: 'dashscope-key',
      workspaceId: 'ws-test',
    })
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        output: { choices: [{ message: { content: [{ image: 'https://temporary.example/qwen.png' }] } }] },
      }))
      .mockResolvedValueOnce(imageResponse())

    const result = await ai.image.generate({ prompt: '保留主体，更换背景', referenceImages: REFERENCE_IMAGES })

    expect(result.success).toBe(true)
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect(init?.headers).toMatchObject({ 'X-DashScope-WorkSpace': 'ws-test' })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'qwen-image-2.0-pro',
      input: {
        messages: [{
          role: 'user',
          content: [
            { image: `data:image/png;base64,${PNG_BASE64}` },
            { image: `data:image/jpeg;base64,${JPEG_BASE64}` },
            { text: '保留主体，更换背景' },
          ],
        }],
      },
      parameters: { n: 1, watermark: false },
    })
  })

  it('seedream 4.x/5.x 使用 Ark images/generations 并解析 b64_json', async () => {
    await initImage({ id: 'seedream', provider: 'seedream', model: 'doubao-seedream-5-0-lite', apiKey: 'ark-key' })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      model: 'doubao-seedream-5-0-lite',
      created: 1,
      data: [{ b64_json: PNG_BASE64, size: '1024x1024' }],
    }))

    const result = await ai.image.generate({ prompt: '电影感山谷', size: { width: 1024, height: 1024 } })

    expect(result.success).toBe(true)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'doubao-seedream-5-0-lite',
      prompt: '电影感山谷',
      size: '1024x1024',
      response_format: 'b64_json',
      sequential_image_generation: 'disabled',
      watermark: false,
    })
  })

  it('seedream 将参考图转换为顶层 image Data URL 数组', async () => {
    await initImage({ id: 'seedream', provider: 'seedream', model: 'doubao-seedream-4-5', apiKey: 'ark-key' })
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        data: [{ url: 'https://temporary.example/seedream.jpeg' }],
      }))
      .mockResolvedValueOnce(imageResponse(JPEG_BYTES, 'image/jpeg'))

    const result = await ai.image.generate({ prompt: '参考角色生成海报', referenceImages: REFERENCE_IMAGES })

    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.images[0]).toMatchObject({ data: JPEG_BYTES, mimeType: 'image/jpeg' })
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'doubao-seedream-4-5',
      prompt: '参考角色生成海报',
      image: [
        `data:image/png;base64,${PNG_BASE64}`,
        `data:image/jpeg;base64,${JPEG_BASE64}`,
      ],
      response_format: 'b64_json',
      sequential_image_generation: 'disabled',
      watermark: false,
    })
  })

  it('pollinations 免费模型使用二进制图片接口', async () => {
    await initImage({ id: 'free-image', provider: 'pollinations', model: 'zimage', apiKey: 'pollinations-key' })
    vi.mocked(fetch).mockResolvedValueOnce(imageResponse(PNG_BYTES, 'image/png'))

    const result = await ai.image.generate({ prompt: 'free image', size: { width: 768, height: 512 } })

    expect(result.success).toBe(true)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://gen.pollinations.ai/image/free%20image?model=zimage&width=768&height=512')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer pollinations-key' })
  })

  it('pollinations 参考图使用 OpenAI-compatible multipart edits 接口', async () => {
    await initImage({ id: 'free-image-edit', provider: 'pollinations', model: 'nanobanana', apiKey: 'pollinations-key' })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      data: [{ b64_json: PNG_BASE64 }],
    }))

    const result = await ai.image.generate({
      prompt: '改成水彩风格',
      referenceImages: REFERENCE_IMAGES,
      size: { width: 1024, height: 1024 },
    })

    expect(result.success).toBe(true)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('https://gen.pollinations.ai/v1/images/edits')
    expect(init?.headers).toEqual({ Authorization: 'Bearer pollinations-key' })
    const form = init?.body as FormData
    expect(form.get('prompt')).toBe('改成水彩风格')
    expect(form.get('model')).toBe('nanobanana')
    expect(form.get('size')).toBe('1024x1024')
    expect(form.get('response_format')).toBe('b64_json')
    expect(form.getAll('image')).toHaveLength(2)
  })
})

describe('ai.image Provider 错误与响应边界', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(async () => {
    await ai.close()
    vi.unstubAllGlobals()
  })

  it('将厂商非 2xx 响应映射为 IMAGE_UPSTREAM_ERROR', async () => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429))

    const result = await ai.image.generate({ prompt: '一只猫' })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_UPSTREAM_ERROR.code)
  })

  it('将 Pollinations 402 解释为余额或 Key 预算耗尽，并保留安全诊断字段', async () => {
    await initImage({ id: 'free', provider: 'pollinations', model: 'zimage', apiKey: 'test-key' })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: 'PAYMENT_REQUIRED',
        message: 'Insufficient pollen balance',
        requestId: 'req_budget_123',
      },
    }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await ai.image.generate({ prompt: '一只猫' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.IMAGE_UPSTREAM_ERROR.code)
      expect(result.error.message).toContain('账户余额或 API Key 预算')
      expect(result.error.cause).toEqual({
        status: 402,
        upstreamCode: 'PAYMENT_REQUIRED',
        upstreamMessage: 'Insufficient pollen balance',
        requestId: 'req_budget_123',
      })
    }
  })

  it('将无法解析的 JSON 映射为 IMAGE_PROTOCOL_ERROR', async () => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    vi.mocked(fetch).mockResolvedValueOnce(new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const result = await ai.image.generate({ prompt: '一只猫' })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_PROTOCOL_ERROR.code)
  })

  it.each([
    ['openai', { data: [] }],
    ['openai', { data: [{ b64_json: '' }] }],
    ['google', { candidates: [{ content: { parts: [{ text: 'no image' }] } }] }],
    ['google', { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: '' } }] } }] }],
    ['qwen', { output: { choices: [] } }],
    ['seedream', { data: [{}] }],
  ] as const)('%s 空图片响应映射为 IMAGE_PROTOCOL_ERROR', async (provider, response) => {
    await initImage({
      id: provider,
      provider,
      model: provider === 'google' ? 'gemini-3.1-flash-image' : provider === 'qwen' ? 'qwen-image-3.0-pro' : provider === 'seedream' ? 'doubao-seedream-5-0-lite' : 'gpt-image-2',
      apiKey: 'test-key',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(response))

    const result = await ai.image.generate({ prompt: '一只猫' })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_PROTOCOL_ERROR.code)
  })

  it('下载临时 URL 失败时返回 IMAGE_UPSTREAM_ERROR', async () => {
    await initImage({ id: 'qwen', provider: 'qwen', model: 'qwen-image-3.0-pro', apiKey: 'test-key' })
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        output: { choices: [{ message: { content: [{ image: 'https://temporary.example/fail.png' }] } }] },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))

    const result = await ai.image.generate({ prompt: '一只猫' })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_UPSTREAM_ERROR.code)
  })

  it('临时 URL 返回非图片 MIME 时返回 IMAGE_PROTOCOL_ERROR', async () => {
    await initImage({ id: 'qwen', provider: 'qwen', model: 'qwen-image-3.0-pro', apiKey: 'test-key' })
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        output: { choices: [{ message: { content: [{ image: 'https://temporary.example/not-image' }] } }] },
      }))
      .mockResolvedValueOnce(new Response('<html>expired</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }))

    const result = await ai.image.generate({ prompt: '一只猫' })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_PROTOCOL_ERROR.code)
  })

  it('pollinations 二进制接口返回空图片时返回 IMAGE_PROTOCOL_ERROR', async () => {
    await initImage({ id: 'free', provider: 'pollinations', model: 'zimage', apiKey: 'test-key' })
    vi.mocked(fetch).mockResolvedValueOnce(imageResponse(new Uint8Array()))

    const result = await ai.image.generate({ prompt: '一只猫' })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.IMAGE_PROTOCOL_ERROR.code)
  })

  it('abortError 映射为 IMAGE_CANCELLED，普通网络异常映射为 IMAGE_UPSTREAM_ERROR', async () => {
    await initImage({ id: 'openai', provider: 'openai', model: 'gpt-image-2', apiKey: 'sk-openai' })
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    const cancelled = await ai.image.generate({ prompt: '一只猫' })
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network failed'))
    const failed = await ai.image.generate({ prompt: '一只猫' })

    expect(cancelled.success).toBe(false)
    expect(failed.success).toBe(false)
    if (!cancelled.success)
      expect(cancelled.error.code).toBe(HaiAIError.IMAGE_CANCELLED.code)
    if (!failed.success)
      expect(failed.error.code).toBe(HaiAIError.IMAGE_UPSTREAM_ERROR.code)
  })
})
