/** 在同一隔离网络内切换 DNS 和后端，验证 Nginx 无需重启即可跟随地址变化。 */
import { Buffer } from 'node:buffer'
import { createSocket } from 'node:dgram'
import { createServer } from 'node:http'

let active = 2
const first = createServer((_request, response) => response.end('backend-one'))
const second = createServer((_request, response) => response.end('backend-two'))
first.listen(3000, '127.0.0.2')
second.listen(3000, '127.0.0.3')

const dns = createSocket('udp4')
dns.on('message', (query, peer) => {
  let end = 12
  while (end < query.length && query[end] !== 0)
    end += query[end] + 1
  end += 5
  if (end > query.length)
    return
  const addressQuery = query.readUInt16BE(end - 4) === 1
  const header = Buffer.alloc(12)
  header.writeUInt16BE(query.readUInt16BE(0), 0)
  header.writeUInt16BE(0x8180, 2)
  header.writeUInt16BE(1, 4)
  header.writeUInt16BE(addressQuery ? 1 : 0, 6)
  const answer = addressQuery ? Buffer.from([0xC0, 0x0C, 0, 1, 0, 1, 0, 0, 0, 1, 0, 4, 127, 0, 0, active]) : Buffer.alloc(0)
  dns.send(Buffer.concat([header, query.subarray(12, end), answer]), peer.port, peer.address)
})
dns.bind(18053, '127.0.0.1')

createServer((request, response) => {
  if (request.url === '/switch') {
    active = 3
    first.close()
    first.closeAllConnections()
  }
  response.end('ready')
}).listen(19001, '127.0.0.1')
