import { core } from '@h-ai/core'
import { vecdb } from '@h-ai/vecdb'

// 使用独立目录运行。真实 RAG 先检查嵌入结果，集合维度必须与嵌入维度一致。
export async function vectorSearchExample(path: string, vector: number[]) {
  const initialized = await vecdb.init({ type: 'lancedb', path })
  if (!initialized.success)
    return initialized
  try {
    const created = await vecdb.collection.create('example_documents', { dimension: vector.length })
    if (!created.success)
      return created
    const inserted = await vecdb.vector.insert('example_documents', [{
      id: 'doc-1',
      vector,
      content: 'Framework introduction',
    }])
    if (!inserted.success)
      return inserted
    return await vecdb.vector.search('example_documents', vector, { topK: 3 })
  }
  finally {
    const closed = await vecdb.close()
    if (!closed.success)
      core.logger.error('Example vector database cleanup failed', { error: closed.error })
  }
}
