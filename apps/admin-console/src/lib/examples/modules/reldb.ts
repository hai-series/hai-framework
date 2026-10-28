import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

// 独立本地示例；应用服务应复用启动阶段已建立的连接。
export async function createUserExample(name: string) {
  const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!initialized.success)
    return initialized
  try {
    const created = await reldb.ddl.createTable('example_users', {
      id: { type: 'TEXT', primaryKey: true },
      name: { type: 'TEXT', notNull: true },
    })
    if (!created.success)
      return created
    return await reldb.tx.wrap(async (tx) => {
      const inserted = await tx.execute('INSERT INTO example_users (id, name) VALUES (?, ?)', ['u1', name])
      // wrap 以正常返回作为提交信号；抛出才会回滚，外层仍返回 HaiResult。
      if (!inserted.success)
        throw new Error(inserted.error.message, { cause: inserted.error })
      const found = await tx.get<{ id: string, name: string }>('SELECT id, name FROM example_users WHERE id = ?', ['u1'])
      if (!found.success)
        throw new Error(found.error.message, { cause: found.error })
      return found.data
    })
  }
  finally {
    const closed = await reldb.close()
    if (!closed.success)
      core.logger.error('Example database cleanup failed', { error: closed.error })
  }
}
