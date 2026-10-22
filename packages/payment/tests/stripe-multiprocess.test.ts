/** 两个真实 Node 进程共享 SQLite；本地 HTTP 服务仅替代 Stripe 的幂等 API。 */
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { build } from 'tsup'
import { expect, it } from 'vitest'

it('stripe 两个独立进程共享映射和退款幂等，后续新进程可查单', async () => {
  const temporaryRoot = path.resolve(import.meta.dirname, '../tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(path.join(temporaryRoot, 'stripe-process-'))
  const sessions = new Map<string, Record<string, unknown>>()
  const outcomes = new Map<string, unknown>()
  let createdOrders = 0
  let createdRefunds = 0
  const server = createServer(async (request, response) => {
    try {
      let body = ''
      for await (const chunk of request)
        body += chunk.toString()
      const pathname = request.url ?? ''
      let result: unknown
      if (pathname === '/v1/account') {
        result = { id: 'acct_process_test' }
      }
      else if (request.method === 'GET') {
        result = sessions.get(pathname.slice('/v1/checkout/sessions/'.length))
      }
      else {
        const key = request.headers['idempotency-key']
        if (typeof key !== 'string')
          throw new Error('Idempotency key required')
        if (!outcomes.has(key)) {
          const params = new URLSearchParams(body)
          if (pathname === '/v1/checkout/sessions') {
            const id = `cs_process_${++createdOrders}`
            const session = {
              id,
              url: `https://checkout.stripe.com/pay/${id}`,
              metadata: { orderNo: params.get('metadata[orderNo]') },
              amount_total: Number(params.get('line_items[0][price_data][unit_amount]')),
              currency: params.get('line_items[0][price_data][currency]'),
              payment_status: 'paid',
              payment_intent: `pi_${id}`,
              status: 'complete',
            }
            sessions.set(id, session)
            outcomes.set(key, session)
          }
          else if (pathname === '/v1/refunds') {
            outcomes.set(key, { id: `re_process_${++createdRefunds}`, status: 'succeeded' })
          }
          else {
            throw new Error('Unexpected endpoint')
          }
        }
        result = outcomes.get(key)
      }
      if (!result)
        throw new Error('Resource not found')
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(result))
    }
    catch (error) {
      response.statusCode = 500
      response.end(JSON.stringify({ error: String(error) }))
    }
  })

  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    const database = path.join(directory, 'shared.sqlite')
    await build({
      entry: { 'payment-main': path.resolve(import.meta.dirname, '../src/payment-main.ts') },
      outDir: path.join(directory, 'bundle'),
      format: ['esm'],
      target: 'node22',
      dts: false,
      splitting: false,
      config: false,
      silent: true,
      external: ['@h-ai/core', '@h-ai/reldb', '@h-ai/audit', 'zod'],
    })
    const workerFile = path.join(directory, 'worker.mjs')
    await writeFile(workerFile, `
import { reldb } from '@h-ai/reldb'
import { payment } from './bundle/payment-main.js'
const nativeFetch = globalThis.fetch
globalThis.fetch = (url, options) => nativeFetch('http://127.0.0.1:${address.port}' + new URL(url).pathname, options)
try {
  const db = await reldb.init({ type: 'sqlite', database: ${JSON.stringify(database)} })
  if (!db.success) throw new Error(db.error.message)
  const initialized = await payment.init({ stripe: { successUrl: 'https://example.invalid/payment/success', secretKey: 'sk_test_process', webhookSecret: 'whsec_process' } })
  if (!initialized.success) throw new Error(initialized.error.message)
  const action = process.argv[2]
  const result = action === 'create'
    ? await payment.createOrder('stripe', { orderNo: 'PROCESS-ORDER', amount: 100, description: 'Test', tradeType: 'h5', notifyUrl: 'https://example.invalid/notify' })
    : action === 'refund'
      ? await payment.refund('stripe', { orderNo: 'PROCESS-ORDER', refundNo: 'PROCESS-REFUND', amount: 50 })
      : await payment.queryOrder('stripe', 'PROCESS-ORDER')
  process.stdout.write('PAY_RESULT=' + JSON.stringify(result) + '\\n')
} finally {
  await payment.close()
  await reldb.close()
}
`)

    /** 每次调用都创建全新进程，超时或退出后清理句柄。 */
    async function run(action: string): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [workerFile, action], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        const timer = setTimeout(() => child.kill(), 15_000)
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString()
        })
        child.once('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.once('close', (code) => {
          clearTimeout(timer)
          if (code !== 0) {
            reject(new Error(`Stripe worker exited ${code}: ${stderr}\n${stdout}`))
            return
          }
          const line = stdout.split('\n').find(value => value.startsWith('PAY_RESULT='))
          if (!line) {
            reject(new Error(`Stripe worker returned no result: ${stdout}`))
            return
          }
          resolve(JSON.parse(line.slice('PAY_RESULT='.length)))
        })
      })
    }

    /** 等待两个进程均退出后才传播失败，保证 finally 清理时没有存活子进程。 */
    async function runBoth(action: string): Promise<unknown[]> {
      const results = await Promise.allSettled([run(action), run(action)])
      for (const result of results) {
        if (result.status === 'rejected')
          throw result.reason
      }
      return results.map(result => result.status === 'fulfilled' ? result.value : undefined)
    }

    const orders = await runBoth('create')
    expect(orders[0]).toEqual(orders[1])
    expect(orders[0]).toMatchObject({ success: true })
    expect(createdOrders).toBe(1)
    expect(await run('query')).toMatchObject({ success: true, data: { orderNo: 'PROCESS-ORDER', transactionId: 'cs_process_1' } })
    const refunds = await runBoth('refund')
    expect(refunds[0]).toEqual(refunds[1])
    expect(refunds[0]).toMatchObject({ success: true, data: { refundId: 're_process_1' } })
    expect(createdRefunds).toBe(1)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
