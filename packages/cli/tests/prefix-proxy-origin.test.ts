import type { ChildProcess } from 'node:child_process'
import type { Server } from 'node:http'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing owned HTTP address')
  return `http://127.0.0.1:${address.port}`
}

async function close(server: Server): Promise<void> {
  if (!server.listening)
    return
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error
    ? reject(error)
    : resolve()))
}

it('真实前缀夹具拒绝authority路径，仍只为静态资源剥离一次前缀', async () => {
  const paths: string[] = []
  let attackerRequests = 0
  const web = createServer((request, response) => {
    paths.push(request.url ?? '')
    response.end('trusted-origin')
  })
  const attacker = createServer((_request, response) => {
    attackerRequests++
    response.end('unexpected-origin')
  })
  const reservation = createServer()
  let child: ChildProcess | undefined
  let closed: Promise<void> | undefined
  try {
    const webUrl = await listen(web)
    const attackerUrl = await listen(attacker)
    const proxyUrl = await listen(reservation)
    await close(reservation)
    child = spawn(process.execPath, [
      fileURLToPath(new URL('./fixtures/prefix-proxy.mjs', import.meta.url)),
    ], {
      env: {
        ...process.env,
        PREFIX_WEB_URL: webUrl,
        PREFIX_SERVICE_URL: webUrl,
        PREFIX_PROXY_URL: proxyUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let failure: Error | undefined
    child.once('error', (error) => {
      failure = error
    })
    closed = new Promise(resolve => child!.once('close', () => resolve()))
    await expect.poll(async () => {
      if (failure)
        throw failure
      return fetch(`${proxyUrl}/yyy/health`, {
        signal: AbortSignal.timeout(100),
      }).then(response => response.status).catch(() => 0)
    }, { timeout: 5000, interval: 25 }).toBe(200)
    for (const slash of ['/', '%2f']) {
      const response = await fetch(`${proxyUrl}/yyy/${slash}${new URL(attackerUrl).host}/stolen`)
      expect(response.status).toBe(400)
      await response.body?.cancel()
    }
    expect(attackerRequests).toBe(0)
    expect(await fetch(`${proxyUrl}/yyy/assets/app.js?v=1`).then(response => response.text())).toBe('trusted-origin')
    expect(await fetch(`${proxyUrl}/yyy/api/v1/ping`).then(response => response.text())).toBe('trusted-origin')
    expect(paths).toEqual(['/assets/app.js?v=1', '/yyy/api/v1/ping'])
  }
  finally {
    try {
      if (child && closed) {
        if (child.exitCode === null)
          child.kill('SIGTERM')
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            closed,
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Owned prefix fixture did not exit')), 5000)
            }),
          ])
        }
        finally {
          clearTimeout(timer)
        }
      }
    }
    finally {
      await Promise.all([
        close(reservation),
        close(web),
        close(attacker),
      ])
    }
  }
}, 15_000)
