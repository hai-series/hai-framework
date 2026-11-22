import { datapipe, HaiDatapipeError } from '@h-ai/datapipe'
import { expect, it, vi } from 'vitest'

it('runs large built-in steps together and executes caller transforms between them', async () => {
  const source = '<p>A long report contains the same material in each section.</p>\n\n'.repeat(3000)
  const cleaned = datapipe.clean(source, { removeHtml: true })
  if (!cleaned.success)
    throw new Error(cleaned.error.message)
  const expectedChunks = datapipe.chunk(cleaned.data, { mode: 'paragraph', maxSize: 500 })
  if (!expectedChunks.success)
    throw new Error(expectedChunks.error.message)

  const transform = vi.fn((text: string) => `${text}\nEND`)
  const result = await datapipe.pipeline()
    .clean({ removeHtml: true })
    .chunk({ mode: 'paragraph', maxSize: 500 })
    .transform(transform)
    .clean({ trim: true })
    .run(source)

  expect(transform).toHaveBeenCalledExactlyOnceWith(cleaned.data)
  expect(result).toEqual({
    success: true,
    data: { text: `${cleaned.data}\nEND`, chunks: expectedChunks.data },
  })
})

it('长短管线都保留继承选项并忽略额外的回调属性', async () => {
  class CleanOptions {
    get trim() {
      return false
    }

    report = () => 'done'
  }

  const options = new CleanOptions()
  const pipeline = datapipe.pipeline().clean(options)
  for (const size of [128 * 1024 - 1, 128 * 1024]) {
    const source = ` ${'a'.repeat(size - 2)} `
    expect(await pipeline.run(source)).toEqual({
      success: true,
      data: { text: source, chunks: [] },
    })
  }
})

it.each([128 * 1024 - 1, 128 * 1024])('对 %i 代码单元的文本保留配置校验详情并按顺序返回错误', async (size) => {
  const source = 'a'.repeat(size)
  const later = { mode: 'character', maxSize: 2, overlap: 2 } as const
  const invalid = await datapipe.pipeline().clean().chunk(later).run(source)
  expect(invalid).toMatchObject({
    success: false,
    error: {
      code: HaiDatapipeError.CONFIG_ERROR.code,
      cause: {
        issues: [
          {
            path: ['overlap'],
          },
        ],
      },
    },
  })

  const after = vi.fn((text: string) => text)
  const first = await datapipe.pipeline()
    .chunk({ mode: 'custom' })
    .chunk(later)
    .transform(after)
    .run(source)
  expect(first).toMatchObject({
    success: false,
    error: { code: HaiDatapipeError.MISSING_SEPARATOR.code },
  })
  expect(after).not.toHaveBeenCalled()
})

it('worker 返回与直接调用相同的分块上限错误', async () => {
  const source = 'a'.repeat(128 * 1024)
  const options = { mode: 'character', maxSize: 1 } as const
  const direct = datapipe.chunk(source, options)
  expect(direct).toMatchObject({
    success: false,
    error: { code: HaiDatapipeError.CHUNK_LIMIT_EXCEEDED.code, httpStatus: 413 },
  })
  expect(await datapipe.pipeline().chunk(options).run(source)).toEqual(direct)
})
