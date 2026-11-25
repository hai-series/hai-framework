const MAX_PDF_BYTES = 20 * 1024 * 1024
const PDF_HEADER = '%PDF-'

/**
 * 从可读的 HTTP(S) 或本页面 Blob 读取有大小限制的 PDF 字节。
 * @param source - 应用为文件提供的预览地址。
 * @param signal - 中止当次预览。
 * @returns 本地 PDF 字节。地址、响应类型、大小或文件头不合法时拒绝。
 *
 * @example 模块内部上下文
 * ```ts
 * const bytes = await loadPdfPreview('/reports/report.pdf', new AbortController().signal)
 * ```
 */
export async function loadPdfPreview(source: string, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const url = URL.parse(source, document.baseURI)
  if (!url || url.username || url.password
    || !(url.protocol === 'http:' || url.protocol === 'https:' || (url.protocol === 'blob:' && url.origin === location.origin))) {
    throw new Error('Unsupported PDF preview address')
  }

  const response = await fetch(url, {
    signal,
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  })
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!response.ok || contentType !== 'application/pdf' || Number(response.headers.get('content-length')) > MAX_PDF_BYTES || !response.body) {
    void response.body?.cancel().catch(() => {})
    throw new Error('Unsupported PDF preview response')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > MAX_PDF_BYTES)
        throw new Error('PDF preview exceeds the size limit')
      chunks.push(value)
    }
  }
  finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const data = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (new TextDecoder().decode(data.subarray(0, PDF_HEADER.length)) !== PDF_HEADER)
    throw new Error('Invalid PDF preview header')
  return data
}
