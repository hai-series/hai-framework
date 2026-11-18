import { datapipe } from '@h-ai/datapipe'
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
