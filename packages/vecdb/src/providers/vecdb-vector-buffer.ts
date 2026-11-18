import type { VectorDocument } from '../vecdb-types.js'

/**
 * 向量已经在 Provider 校验维数。连续 Float64 缓冲区保留原精度并按一次转移发送。
 * @example 模块内部上下文
 * ```ts
 * const packed: VectorBuffer = { rows: [], dimension: 3, vectors: new Float64Array() }
 * ```
 */
export interface VectorBuffer {
  rows: Array<{ id: string, content: string, metadata: string }>
  dimension: number
  vectors: Float64Array<ArrayBuffer>
}

/**
 * 批量任务复用原有 JSON 序列化语义，避免克隆元数据中的自定义值。
 * @example 模块内部上下文
 * ```ts
 * const batch = packVectors([{ id: 'example', vector: [1, 2] }], 2)
 * ```
 */
export function packVectors(documents: VectorDocument[], dimension: number): VectorBuffer {
  const vectors = new Float64Array(documents.length * dimension)
  const rows = documents.map((doc, index) => {
    vectors.set(doc.vector, index * dimension)
    return {
      id: doc.id,
      content: doc.content ?? '',
      metadata: JSON.stringify(doc.metadata ?? {}),
    }
  })
  return { rows, vectors, dimension }
}

/**
 * SQL 始终由宿主选择表和写入语义；这里仅构建值占位符及参数数组。
 * @example 模块内部上下文
 * ```ts
 * const args = preparePgvectorRows([{ id: 'example', vector: [1, 2] }])
 * ```
 */
export function preparePgvectorRows(documents: VectorDocument[] | VectorBuffer): { placeholders: string, params: unknown[] } {
  const values: string[] = []
  const params: unknown[] = []
  if (Array.isArray(documents)) {
    for (const [index, doc] of documents.entries()) {
      const base = index * 4
      values.push(`($${base + 1}, $${base + 2}::vector, $${base + 3}, $${base + 4}::jsonb)`)
      params.push(doc.id, `[${doc.vector.join(',')}]`, doc.content ?? '', JSON.stringify(doc.metadata ?? {}))
    }
  }
  else {
    const { rows, vectors, dimension } = documents
    for (const [index, row] of rows.entries()) {
      const base = index * 4
      values.push(`($${base + 1}, $${base + 2}::vector, $${base + 3}, $${base + 4}::jsonb)`)
      const vector = vectors.subarray(index * dimension, (index + 1) * dimension)
      params.push(row.id, `[${vector.join(',')}]`, row.content, row.metadata)
    }
  }
  return {
    placeholders: values.join(', '),
    params,
  }
}

/**
 * 阈值按批次向量元素计量，避免小批次付出线程调度成本。
 * @example 模块内部上下文
 * ```ts
 * const shouldOffload = useVectorWorker(1000, 384)
 * ```
 */
export function useVectorWorker(count: number, dimension: number): boolean {
  return count * dimension >= 65_536
}
