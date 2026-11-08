import { expect, it } from 'vitest'
import { ImageConfigSchema, resolveImageModel } from '../src/ai-config.js'

it('图像厂商地址只裁去尾部斜杠，不反复扫描合法长路径', () => {
  const baseUrl = `https://provider.example/${'/'.repeat(120_000)}v1`
  const config = ImageConfigSchema.parse({
    generateModel: 'image',
    models: [
      {
        id: 'image',
        provider: 'openai',
        model: 'image-model',
        apiKey: 'fixture-key',
        baseUrl: `${baseUrl}///`,
      },
    ],
  })
  const started = performance.now()
  expect(resolveImageModel(config)).toMatchObject({
    success: true,
    data: { baseUrl },
  })
  // 只访问尾部，预算不依赖厂商请求、模型配额或网络速度。
  expect(performance.now() - started).toBeLessThan(2000)
})
