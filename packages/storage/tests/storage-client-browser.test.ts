/** 真实 Chromium XHR 验证上传取消、终态结算与事件资源清理。 */
import type { Browser } from '@playwright/test'
import type { Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { build } from 'tsup'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe.skipIf(process.env.HAI_STORAGE_RUN_BROWSER_GATES !== '1')('storage client real browser cancellation', () => {
  let browser: Browser | undefined
  let server: Server | undefined
  let temporary: string | undefined
  let origin = ''
  const received = new Map<string, number>()

  /** 只删除本测试通过mkdtemp创建的目录；校验与文件操作使用同一绝对路径。 */
  async function removeFixture(root: string): Promise<void> {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('hai-storage-browser-'))
      throw new Error('Unexpected browser fixture cleanup directory')
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }

  beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'hai-storage-browser-'))
    const browserConfig = path.join(temporary, 'tsconfig.json')
    // 不继承源码开发别名，才能让真实package.exports按browser条件选择Core入口。
    await writeFile(browserConfig, JSON.stringify({ compilerOptions: { noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler' } }))
    // 已有构建器打包真实源码与 Core browser 入口，不使用另一个上传实现。
    await build({ config: false, tsconfig: browserConfig, entry: { client: fileURLToPath(new URL('../src/client/index.ts', import.meta.url)) }, outDir: temporary, format: ['iife'], globalName: 'storageClientFixture', platform: 'browser', target: 'es2022', dts: false, splitting: false, noExternal: [/.*/], silent: true })
    const bundle = await readFile(path.join(temporary, 'client.global.js'), 'utf8')
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/client.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' })
        response.end(bundle)
        return
      }
      if (url.pathname === '/upload') {
        const scenario = url.searchParams.get('scenario') ?? ''
        received.set(scenario, (received.get(scenario) ?? 0) + 1)
        if (scenario === 'network') {
          request.socket.destroy()
          return
        }
        request.resume()
        request.on('end', () => {
          // 进行中取消用例保持真实请求等待响应，由浏览器实际 abort 终止连接。
          if (['during', 'external', 'timeout', 'callback'].includes(scenario))
            return
          response.writeHead(scenario === 'http' ? 403 : 204)
          response.end()
        })
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<!doctype html><title>Storage upload cancellation</title><script src="/client.js"></script>')
    })
    await new Promise<void>((resolve, reject) => {
      server?.once('error', reject)
      server?.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing browser fixture HTTP address')
    origin = `http://127.0.0.1:${address.port}`
    // 缺少实际浏览器是门禁失败，不能跳成成功。
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  }, 30_000)

  afterAll(async () => {
    try {
      await browser?.close()
    }
    finally {
      try {
        if (server) {
          server.closeAllConnections()
          await new Promise<void>((resolve, reject) => server?.close(error => error ? reject(error) : resolve()))
        }
      }
      finally {
        if (temporary)
          await removeFixture(temporary)
      }
    }
  })

  it.each(['pre', 'open-race', 'during', 'external', 'success', 'http', 'bad-url', 'network', 'timeout', 'callback'] as const)('%s 上传只结算一次并移除所有本次监听', async (scenario) => {
    if (!browser)
      throw new Error('Real browser was not started')
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      const pageErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto(origin)
      expect(pageErrors).toEqual([])
      const evidence = await page.evaluate(async ({ origin, scenario }) => {
        // 页面已从本次真实bundle加载公开客户端；避免Vitest改写浏览器内的动态import。
        const client: typeof import('@h-ai/storage/client') = Reflect.get(globalThis, 'storageClientFixture')
        const controller = new AbortController()
        const native = XMLHttpRequest
        const requests: XMLHttpRequest[] = []
        const listeners = new Map<EventTarget, Set<{ type: string, listener: EventListenerOrEventListenerObject | null }>>()
        let sends = 0
        let aborts = 0
        let progress = 0
        let settlements = 0
        let canceled = false
        let timeout: ReturnType<typeof setTimeout> | undefined

        // 只观察本次真实原生实例，不模拟 open/send/abort 或网络事件。
        function monitor(target: EventTarget): void {
          const active = new Set<{ type: string, listener: EventListenerOrEventListenerObject | null }>()
          listeners.set(target, active)
          const add = target.addEventListener.bind(target)
          const remove = target.removeEventListener.bind(target)
          target.addEventListener = (type, listener, options) => {
            active.add({ type, listener })
            add(type, listener, options)
          }
          target.removeEventListener = (type, listener, options) => {
            for (const entry of active) {
              if (entry.type === type && entry.listener === listener)
                active.delete(entry)
            }
            remove(type, listener, options)
          }
        }
        monitor(controller.signal)
        class ObservedXHR extends native {
          constructor() {
            super()
            requests.push(this)
            monitor(this)
            monitor(this.upload)
            if (scenario === 'timeout')
              this.timeout = 100
          }

          override open(method: string, url: string | URL, async = true, username?: string | null, password?: string | null): void {
            super.open(method, url, async, username, password)
            if (scenario === 'open-race')
              controller.abort()
          }

          override send(body?: Document | XMLHttpRequestBodyInit | null): void {
            sends++
            super.send(body)
          }

          override abort(): void {
            aborts++
            super.abort()
          }
        }
        window.XMLHttpRequest = ObservedXHR
        if (scenario === 'pre')
          controller.abort()
        try {
          const url = scenario === 'bad-url' ? 'http://[invalid' : `${origin}/upload?scenario=${scenario}`
          const data = new Blob([new Uint8Array(8 * 1024 * 1024)])
          const pending = client.uploadWithPresignedUrl(url, data, {
            abortController: controller,
            contentType: 'application/octet-stream',
            onProgress: () => {
              progress++
              if (scenario === 'callback')
                throw new Error('Progress handler failed')
              if (canceled)
                return
              if (scenario === 'during') {
                canceled = true
                controller.abort()
              }
              else if (scenario === 'external') {
                canceled = true
                requests.at(-1)?.abort()
              }
            },
          }).then((result) => {
            settlements++
            return result
          })
          const result = await Promise.race([pending, new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('XHR upload did not settle')), 4_000)
          })])
          const abortsBeforeFinalSignal = aborts
          controller.abort()
          await new Promise(resolve => setTimeout(resolve, 30))
          return { result, sends, aborts, abortsBeforeFinalSignal, progress, settlements, activeListeners: [...listeners.values()].reduce((sum, active) => sum + active.size, 0) }
        }
        finally {
          if (timeout)
            clearTimeout(timeout)
          window.XMLHttpRequest = native
          for (const request of requests) {
            if (request.readyState !== native.DONE)
              request.abort()
          }
        }
      }, { origin, scenario })
      expect(evidence.result.success).toBe(scenario === 'success')
      if (!evidence.result.success)
        expect(evidence.result.error).toBeTruthy()
      expect(evidence.settlements).toBe(1)
      expect(evidence.activeListeners).toBe(0)
      expect(evidence.aborts).toBe(evidence.abortsBeforeFinalSignal)
      if (scenario === 'pre' || scenario === 'open-race' || scenario === 'bad-url') {
        expect(evidence.sends).toBe(0)
        expect(received.get(scenario) ?? 0).toBe(0)
      }
      else {
        expect(evidence.sends).toBe(1)
        // 浏览器可能自动重试断开的TCP连接；库的send仍只能调用一次，不承诺远端恰好一次。
        if (scenario === 'network')
          expect(received.get(scenario)).toBeGreaterThan(0)
        else
          expect(received.get(scenario)).toBe(1)
      }
      if (scenario === 'during' || scenario === 'external' || scenario === 'callback') {
        expect(evidence.progress).toBeGreaterThan(0)
        expect(evidence.aborts).toBe(1)
      }
      if (scenario === 'callback')
        expect(evidence.result.error).toBe('Progress handler failed')
    }
    finally {
      await context.close()
    }
  }, 15_000)
})
