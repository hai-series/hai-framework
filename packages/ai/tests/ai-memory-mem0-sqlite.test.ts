/** 验证 Mem0 的真实 SQLite 历史存储与框架升级后的数据库驱动兼容。 */
import { HistoryManagerFactory } from 'mem0ai/oss'
import { describe, expect, it } from 'vitest'

describe('mem0 SQLite history compatibility', () => {
  it('persists history and session messages, resets and closes the database', async () => {
    const history = HistoryManagerFactory.create('sqlite', { provider: 'sqlite', config: { historyDbPath: ':memory:' } })
    try {
      await history.addHistory('memory-1', null, 'remembered value', 'ADD')
      expect(await history.getHistory('memory-1')).toEqual([
        expect.objectContaining({ memory_id: 'memory-1', new_value: 'remembered value', action: 'ADD' }),
      ])
      if (!history.saveMessages || !history.getLastMessages)
        throw new Error('The SQLite history provider does not support session messages')
      await history.saveMessages([{ role: 'user', content: 'session message' }], 'session-1')
      expect(await history.getLastMessages('session-1')).toEqual([
        expect.objectContaining({ role: 'user', content: 'session message' }),
      ])
      expect(await history.getLastMessages('another-session')).toEqual([])
      await history.reset()
      expect(await history.getHistory('memory-1')).toEqual([])
    }
    finally {
      history.close()
    }
  })
})
