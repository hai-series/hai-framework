/** JSON 字节上限同时覆盖字段、转义和 UTF-8 多字节字符。 */
const maxDemoJsonBytes = 16 * 1024

export async function readDemoJson(request: Request): Promise<unknown> {
  if (!request.body || Number(request.headers.get('Content-Length')) > maxDemoJsonBytes)
    return undefined

  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let body = ''
  let consumed = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        consumed = true
        return JSON.parse(body + decoder.decode())
      }
      bytes += value.byteLength
      if (bytes > maxDemoJsonBytes)
        return undefined
      body += decoder.decode(value, { stream: true })
    }
  }
  catch {
    return undefined
  }
  finally {
    if (!consumed)
      await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
