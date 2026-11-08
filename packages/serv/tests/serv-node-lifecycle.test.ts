import { errorMonitor, once } from 'node:events'
import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

describe('node listener lifecycle', () => {
  it('启动后立即关闭会取消待完成绑定，并复用关闭结果', async () => {
    const onListening = vi.fn()
    const app = serv.createApp({
      contract: {},
      procedures: {},
      http: { access: false },
    })
    const handle = serv.listen(app, { port: 0, onListening })
    try {
      const closed = handle.close()
      expect(handle.close()).toBe(closed)
      await closed
      await new Promise(resolve => setImmediate(resolve))
      expect(handle.server.listening).toBe(false)
      expect(handle.server.address()).toBeNull()
      expect(onListening).not.toHaveBeenCalled()
      expect(handle.server.listenerCount('error')).toBe(0)
      expect(handle.server.listenerCount(errorMonitor)).toBe(0)
    }
    finally { await handle.close().catch(() => {}) }
  })

  it('已开始监听的服务关闭后释放实际端口', async () => {
    const app = serv.createApp({
      contract: {},
      procedures: {},
      http: { access: false },
    })
    const handle = serv.listen(app, { port: 0 })
    try {
      if (!handle.server.listening)
        await once(handle.server, 'listening')
      expect(handle.server.address()).not.toBeNull()
      await handle.close()
      expect(handle.server.listening).toBe(false)
      expect(handle.server.address()).toBeNull()
      expect(handle.server.listenerCount('error')).toBe(0)
      expect(handle.server.listenerCount(errorMonitor)).toBe(0)
    }
    finally { await handle.close().catch(() => {}) }
  })

  it('监听失败保留真实原因，不把地址占用当作幂等关闭', async () => {
    const occupied = createServer()
    occupied.listen(0, '127.0.0.1')
    await once(occupied, 'listening')
    const address = occupied.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture address')
    const app = serv.createApp({
      contract: {},
      procedures: {},
      http: { access: false },
    })
    const handle = serv.listen(app, { port: address.port })
    try {
      await once(handle.server, 'error')
      await expect(handle.close()).rejects.toMatchObject({
        errors: [
          { code: 'EADDRINUSE' },
        ],
      })
      expect(handle.server.listening).toBe(false)
      expect(handle.server.address()).toBeNull()
      expect(handle.server.listenerCount('error')).toBe(0)
      expect(handle.server.listenerCount(errorMonitor)).toBe(0)
    }
    finally {
      await handle.close().catch(() => {})
      await new Promise<void>((resolve, reject) => occupied.close(error => error
        ? reject(error)
        : resolve()))
    }
  })
})
