import { randomUUID } from 'node:crypto'
import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it } from 'vitest'
import { feedback, HaiFeedbackError } from '../src/index.js'

const owner = {
  scopeId: 'workspace',
  userId: 'owner',
  permissions: ['feedback:create'],
}

afterEach(async () => {
  await feedback.close()
  await reldb.close()
})

describe('反馈生命周期', () => {
  it('只依赖 RelDB，关闭等待已经接受的写入，重新打开可以读取', async () => {
    expect(await feedback.init({ appId: 'orders' })).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.CONFIG_ERROR.code },
    })
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect((await feedback.init({ appId: 'orders' })).success).toBe(true)
    const id = randomUUID()
    const write = feedback.submit({ id, body: 'Missing order' }, owner)
    const closed = feedback.close()
    expect(await feedback.get(id, owner)).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.NOT_INITIALIZED.code },
    })
    expect(await write).toMatchObject({
      success: true,
      data: { id },
    })
    expect((await closed).success).toBe(true)
    expect((await feedback.init({ appId: 'orders' })).success).toBe(true)
    expect(await feedback.get(id, owner)).toMatchObject({
      success: true,
      data: {
        report: { id },
      },
    })
    const tables = await reldb.sql.query<{ name: string }>('SELECT name FROM sqlite_master WHERE type = \'table\' AND name LIKE \'hai_feedback_%\' ORDER BY name')
    expect(tables).toMatchObject({
      success: true,
      data: [
        { name: 'hai_feedback_attachments' },
        { name: 'hai_feedback_messages' },
        { name: 'hai_feedback_reports' },
      ],
    })
  })

  it('并发关闭不会让尚未完成初始化的实例重新就绪', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const opening = feedback.init({ appId: 'orders' })
    expect(await feedback.init({ appId: 'support' })).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.INIT_IN_PROGRESS.code },
    })
    const closed = feedback.close()
    expect(await opening).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.NOT_INITIALIZED.code },
    })
    expect((await closed).success).toBe(true)
    expect(feedback.isInitialized).toBe(false)
  })
})
