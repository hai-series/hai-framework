import { datapipe } from '@h-ai/datapipe'

// datapipe 是纯函数/管道能力，不需要 init 或 close。
export async function chunkDocumentExample(rawHtml: string) {
  return await datapipe.pipeline()
    .clean({ removeHtml: true, normalizeWhitespace: true })
    .chunk({ mode: 'paragraph', maxSize: 1000, overlap: 200 })
    .run(rawHtml)
}
