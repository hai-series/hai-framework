/** 本轮独立 loopback 网关：API 保留完整目录，只为根目录静态站点剥离一次前缀。 */
import { createServer, request as proxyRequest } from 'node:http'
import process from 'node:process'

const web = new URL(process.env.PREFIX_WEB_URL)
const service = new URL(process.env.PREFIX_SERVICE_URL)
const address = new URL(process.env.PREFIX_PROXY_URL)
const prefix = '/yyy'
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', address)
  if (url.pathname === `${prefix}/health`)
    return response.writeHead(200).end('ok')
  if (url.pathname === prefix)
    return response.writeHead(308, { Location: `${prefix}/${url.search}` }).end()
  if (url.pathname === `${prefix}/runtime-config.js`) {
    response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }).end(`globalThis.__HAI_PUBLIC_CONFIG__=${JSON.stringify({ apiBase: `${address.origin}${prefix}/api/v1` })};`)
    return
  }
  const isApi = url.pathname.startsWith(`${prefix}/api/`)
  if (!url.pathname.startsWith(`${prefix}/`))
    return response.writeHead(404).end()
  const upstream = new URL(`${isApi ? url.pathname : url.pathname.slice(prefix.length)}${url.search}`, isApi ? service : web)
  const forwarded = proxyRequest(upstream, { method: request.method, headers: request.headers }, (result) => {
    response.writeHead(result.statusCode ?? 502, result.headers)
    result.pipe(response)
  })
  forwarded.once('error', () => {
    if (!response.headersSent)
      response.writeHead(502).end()
    else response.destroy()
  })
  request.pipe(forwarded)
  response.once('close', () => forwarded.destroy())
})
server.listen(Number(address.port), address.hostname)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeAllConnections()
    server.close()
  })
}
