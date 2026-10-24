import type { Socket } from 'node:net'
import { createServer } from 'node:net'

/** 仅绑定回环地址的实际 SMTP 协议夹具，不向外部邮箱发信。 */
export function createFeedbackSmtpFixture() {
  const messages: string[] = []
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.write('220 feedback-process-fixture ESMTP\r\n')
    let pending = ''
    let data = false
    let message = ''
    socket.on('data', (bytes) => {
      pending += bytes.toString('utf8')
      if (pending.length > 262144) {
        socket.destroy()
        return
      }
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n')
        const line = pending.slice(0, end)
        pending = pending.slice(end + 2)
        if (data) {
          if (line === '.') {
            messages.push(message)
            message = ''
            data = false
            socket.write('250 accepted\r\n')
          }
          else if (message.length < 262144) {
            message += `${line}\r\n`
          }
          continue
        }
        if (/^(?:EHLO|HELO)/i.test(line)) {
          socket.write('250-feedback-process-fixture\r\n250 8BITMIME\r\n')
        }
        else if (/^DATA/i.test(line)) {
          data = true
          socket.write('354 end with dot\r\n')
        }
        else if (/^QUIT/i.test(line)) {
          socket.end('221 bye\r\n')
        }
        else {
          socket.write('250 OK\r\n')
        }
      }
    })
  })
  return {
    messages,
    async start(): Promise<number> {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('SMTP fixture listener unavailable')
      return address.port
    },
    async close(): Promise<void> {
      for (const socket of sockets) socket.destroy()
      if (server.listening)
        await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
