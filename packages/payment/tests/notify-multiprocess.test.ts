/** 两个真实 Node 节点验签同一支付宝通知，共享 SQLite 事务仅生成一次履约 outbox。 */
import { spawn } from 'node:child_process'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { reldb } from '@h-ai/reldb'
import { build } from 'tsup'
import { expect, it } from 'vitest'
import { initializeExamplePaymentStore } from '../examples/payment-notify-consumer'
import { formatAlipayTime } from '../src/providers/alipay/payment-alipay-time'

it('notify 双节点与重启后重复到达不重复履约，校验失败和事务中断可回滚', async () => {
  const temporaryRoot = path.resolve(import.meta.dirname, '../tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(path.join(temporaryRoot, 'notify-process-'))
  if (!directory.startsWith(`${temporaryRoot}${path.sep}`))
    throw new Error('Unexpected notification test directory')
  const database = path.join(directory, 'shared.sqlite')
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  /** 真实签名；每个节点独立验签和核验商户，不把预解析结果当通知证明。 */
  function signedNotification(overrides: Record<string, string> = {}) {
    const params: Record<string, string> = {
      app_id: 'app_notify_process',
      seller_id: 'seller_notify_process',
      notify_id: 'notify_process_1',
      notify_type: 'trade_status_sync',
      notify_time: formatAlipayTime(new Date()),
      out_trade_no: 'ORDER_PROCESS',
      trade_no: 'ALI_PROCESS_1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '1.00',
      gmt_payment: '2026-01-01 00:00:00',
      sign_type: 'RSA2',
      ...overrides,
    }
    const signer = createSign('RSA-SHA256')
    signer.update(Object.keys(params).filter(key => key !== 'sign_type').sort().map(key => `${key}=${params[key]}`).join('&'))
    params.sign = signer.sign(privateKey, 'base64')
    return { body: new URLSearchParams(params).toString(), headers: {} }
  }

  try {
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    expect((await initializeExamplePaymentStore(reldb)).success).toBe(true)
    for (const [orderNo, currency, provider] of [
      ['ORDER_PROCESS', 'CNY', 'alipay'],
      ['ORDER_OTHER', 'CNY', 'alipay'],
      ['ORDER_ROLLBACK', 'CNY', 'alipay'],
      ['ORDER_CURRENCY', 'USD', 'alipay'],
      ['ORDER_PROVIDER', 'CNY', 'wechat'],
    ]) {
      expect((await reldb.sql.execute(
        'INSERT INTO example_payment_orders (id, provider, merchant_scope, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)',
        [orderNo, provider, 'trusted_merchant_scope', 100, currency, 'pending'],
      )).success).toBe(true)
    }
    await reldb.close()
    await build({
      entry: {
        consumer: path.resolve(import.meta.dirname, '../examples/payment-notify-consumer.ts'),
        payment: path.resolve(import.meta.dirname, '../src/payment-main.ts'),
      },
      outDir: path.join(directory, 'bundle'),
      format: ['esm'],
      target: 'node22',
      dts: false,
      splitting: false,
      config: false,
      silent: true,
      external: ['@h-ai/core', '@h-ai/reldb', '@h-ai/audit', 'zod'],
    })
    await writeFile(path.join(directory, 'fixtures.json'), JSON.stringify({
      config: { alipay: { appId: 'app_notify_process', sellerId: 'seller_notify_process', privateKey, alipayPublicKey: publicKey, returnUrl: 'https://example.invalid/payment/return' } },
      notifications: {
        valid: signedNotification(),
        pending: signedNotification({ trade_status: 'WAIT_BUYER_PAY', notify_id: 'notify_pending' }),
        mismatch: signedNotification({ out_trade_no: 'ORDER_OTHER', total_amount: '2.00', notify_id: 'notify_bad_amount' }),
        currency: signedNotification({ out_trade_no: 'ORDER_CURRENCY', notify_id: 'notify_bad_currency' }),
        provider: signedNotification({ out_trade_no: 'ORDER_PROVIDER', notify_id: 'notify_bad_provider' }),
        transaction: signedNotification({ trade_no: 'ANOTHER_TRANSACTION', notify_id: 'notify_bad_transaction' }),
        reusedEvent: signedNotification({ out_trade_no: 'ORDER_OTHER' }),
        rollback: signedNotification({ out_trade_no: 'ORDER_ROLLBACK', notify_id: 'notify_rollback' }),
      },
    }))
    const workerFile = path.join(directory, 'worker.mjs')
    await writeFile(workerFile, `
import { readFile } from 'node:fs/promises'
import { core } from '@h-ai/core'
// 在加载业务模块前使用 JSON 日志，避免短生命周期夹具创建 pretty 日志线程。
core.logger.configure({ format: 'json' })
const { reldb } = await import('@h-ai/reldb')
const { payment } = await import('./bundle/payment.js')
const { consumePaymentNotification } = await import('./bundle/consumer.js')
const fixtures = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'))
let result
try {
  const db = await reldb.init({ type: 'sqlite', database: ${JSON.stringify(database)} })
  if (!db.success) throw new Error(db.error.message)
  const initialized = await payment.init(fixtures.config)
  if (!initialized.success) throw new Error(initialized.error.message)
  const go = new Promise(resolve => process.once('message', resolve))
  process.send('ready')
  await go
  const verified = await payment.handleNotify('alipay', fixtures.notifications[process.argv[2]])
  result = verified.success ? await consumePaymentNotification(reldb, 'alipay', 'trusted_merchant_scope', verified.data) : verified
} finally {
  try {
    await payment.close()
    await reldb.close()
  } finally {
    process.disconnect()
  }
}
// 结果同时证明业务执行及模块关闭完成；父进程仍须等待正常退出。
process.stdout.write('NOTIFY_RESULT=' + JSON.stringify({ pid: process.pid, result }) + '\\n')
`)

    /** 等所有独立进程就绪后同时开始，确保真实跨节点竞争同一业务订单。 */
    async function run(action: string, count = 1): Promise<Array<{ pid: number, result: { success: boolean, data?: string } }>> {
      const children = Array.from({ length: count }, () => spawn(process.execPath, [workerFile, action], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      }))
      const ready = children.map(child => new Promise<void>((resolve, reject) => {
        child.once('message', () => resolve())
        child.once('error', reject)
        child.once('exit', code => reject(new Error(`Notification worker exited before ready: ${code}`)))
      }))
      const results = children.map(child => new Promise<{ pid: number, result: { success: boolean, data?: string } }>((resolve, reject) => {
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          child.kill()
        }, 15_000)
        child.stdout!.on('data', chunk => stdout += chunk.toString())
        child.stderr!.on('data', chunk => stderr += chunk.toString())
        child.once('error', reject)
        child.once('close', (code, signal) => {
          clearTimeout(timer)
          const line = stdout.split('\n').find(value => value.startsWith('NOTIFY_RESULT='))
          if (code !== 0 || !line)
            reject(new Error(`Notification worker failed (code=${code}, signal=${signal}, timedOut=${timedOut}): ${stderr}\n${stdout}`))
          else
            resolve(JSON.parse(line.slice('NOTIFY_RESULT='.length)))
        })
      }))
      try {
        await Promise.all(ready)
        for (const child of children)
          child.send('go')
        return await Promise.all(results)
      }
      finally {
        for (const child of children)
          child.kill()
        await Promise.allSettled(results)
      }
    }

    const duplicates = await run('valid', 2)
    expect(new Set(duplicates.map(value => value.pid)).size).toBe(2)
    expect(duplicates.map(value => value.result).sort((a, b) => String(a.data).localeCompare(String(b.data)))).toEqual([
      { success: true, data: 'applied' },
      { success: true, data: 'duplicate' },
    ])
    expect((await run('valid'))[0].result).toEqual({ success: true, data: 'duplicate' })
    expect((await run('pending'))[0].result).toEqual({ success: true, data: 'ignored' })
    expect((await run('mismatch'))[0].result.success).toBe(false)
    expect((await run('currency'))[0].result.success).toBe(false)
    expect((await run('provider'))[0].result.success).toBe(false)
    expect((await run('transaction'))[0].result.success).toBe(false)
    expect((await run('reusedEvent'))[0].result.success).toBe(false)

    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM example_payment_outbox')).toMatchObject({ success: true, data: { count: 1 } })
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM example_payment_events')).toMatchObject({ success: true, data: { count: 1 } })
    expect(await reldb.sql.get('SELECT status FROM example_payment_orders WHERE id = ?', ['ORDER_PROCESS'])).toMatchObject({ success: true, data: { status: 'paid' } })
    expect(await reldb.sql.get('SELECT status FROM example_payment_orders WHERE id = ?', ['ORDER_OTHER'])).toMatchObject({ success: true, data: { status: 'pending' } })
    expect((await reldb.sql.execute('UPDATE example_payment_orders SET status = ? WHERE id = ?', ['refunded', 'ORDER_PROCESS'])).success).toBe(true)
    await reldb.close()
    expect((await run('valid'))[0].result).toEqual({ success: true, data: 'duplicate' })
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    expect(await reldb.sql.get('SELECT status FROM example_payment_orders WHERE id = ?', ['ORDER_PROCESS'])).toMatchObject({ success: true, data: { status: 'refunded' } })
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM example_payment_outbox')).toMatchObject({ success: true, data: { count: 1 } })
    expect((await reldb.ddl.dropTable('example_payment_outbox')).success).toBe(true)
    await reldb.close()
    expect((await run('rollback'))[0].result.success).toBe(false)
    expect((await reldb.init({ type: 'sqlite', database })).success).toBe(true)
    expect(await reldb.sql.get('SELECT status FROM example_payment_orders WHERE id = ?', ['ORDER_ROLLBACK'])).toMatchObject({ success: true, data: { status: 'pending' } })
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM example_payment_events')).toMatchObject({ success: true, data: { count: 1 } })
  }
  finally {
    await reldb.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
