import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HaiReldbError, reldb } from '../src/index.js'

describe.each(['sync', 'worker'] as const)('sqlite %s transaction isolation', (executor) => {
  beforeEach(async () => {
    const initialized = await reldb.init({
      type: 'sqlite',
      database: ':memory:',
      sqlite: { executor },
    })
    expect(initialized.success).toBe(true)
    const table = await reldb.ddl.createTable('entries', {
      name: { type: 'TEXT', primaryKey: true, notNull: true },
    })
    expect(table.success).toBe(true)
  })

  afterEach(async () => {
    expect((await reldb.close()).success).toBe(true)
  })

  it('runs independent reads, writes and DDL after the active transaction rolls back', async () => {
    const begun = await reldb.tx.begin()
    expect(begun.success).toBe(true)
    if (!begun.success)
      return
    const tx = begun.data
    const inserted = await tx.execute('INSERT INTO entries (name) VALUES (?)', ['private'])
    const independentRead = reldb.sql.query('SELECT name FROM entries')
    const independentWrite = reldb.sql.execute('INSERT INTO entries (name) VALUES (?)', ['outside'])
    const independentDdl = reldb.ddl.createTable('independent', {
      id: { type: 'INTEGER', primaryKey: true },
    })
    const rolledBack = await tx.rollback()
    expect(inserted.success).toBe(true)
    expect(rolledBack.success).toBe(true)
    expect(await independentRead).toEqual({ success: true, data: [] })
    expect((await independentWrite).success).toBe(true)
    expect((await independentDdl).success).toBe(true)
    expect(await reldb.sql.query('SELECT name FROM entries')).toEqual({
      success: true,
      data: [
        { name: 'outside' },
      ],
    })
    expect(await reldb.sql.query('SELECT id FROM independent')).toEqual({ success: true, data: [] })
  })

  it('finishes all statements already accepted by the handle before rolling back', async () => {
    const begun = await reldb.tx.begin()
    expect(begun.success).toBe(true)
    if (!begun.success)
      return
    const tx = begun.data
    const batch = tx.batch([
      {
        sql: 'INSERT INTO entries (name) VALUES (?)',
        params: ['first'],
      },
      {
        sql: 'INSERT INTO entries (name) VALUES (?)',
        params: ['second'],
      },
    ])
    const [batched, rolledBack] = await Promise.all([
      batch,
      tx.rollback(),
    ])
    expect(batched.success).toBe(true)
    expect(rolledBack.success).toBe(true)
    expect(await reldb.sql.query('SELECT name FROM entries')).toEqual({ success: true, data: [] })
  })

  it('reports global DML and DDL used from the wrapping callback', async () => {
    const wrongSql = await reldb.tx.wrapResult(() => reldb.sql.execute('INSERT INTO entries (name) VALUES (?)', ['wrong']))
    expect(wrongSql).toMatchObject({
      success: false,
      error: { code: HaiReldbError.TRANSACTION_FAILED.code },
    })
    const wrongDdl = await reldb.tx.wrapResult(() => reldb.ddl.dropTable('entries'))
    expect(wrongDdl).toMatchObject({
      success: false,
      error: { code: HaiReldbError.TRANSACTION_FAILED.code },
    })
    const written = await reldb.tx.wrapResult(tx => tx.execute('INSERT INTO entries (name) VALUES (?)', ['right']))
    expect(written.success).toBe(true)
    expect(await reldb.sql.query('SELECT name FROM entries')).toEqual({
      success: true,
      data: [
        { name: 'right' },
      ],
    })
  })

  it('rolls back a failed deferred foreign key commit and accepts the next transaction', async () => {
    const setup = await reldb.ddl.raw(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (pid INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED);
    `)
    expect(setup.success).toBe(true)
    const committed = await reldb.tx.wrapResult(tx => tx.execute('INSERT INTO child (pid) VALUES (?)', [1]))
    expect(committed).toMatchObject({
      success: false,
      error: { code: HaiReldbError.TRANSACTION_FAILED.code },
    })
    expect(await reldb.sql.query('SELECT pid FROM child')).toEqual({ success: true, data: [] })
    const recovered = await reldb.tx.wrapResult(tx => tx.execute('INSERT INTO parent (id) VALUES (?)', [1]))
    expect(recovered.success).toBe(true)
    expect(await reldb.sql.query('SELECT id FROM parent')).toEqual({
      success: true,
      data: [
        { id: 1 },
      ],
    })
  })

  it('applies explicit NOT NULL to text primary keys and maps duplicate primary keys', async () => {
    const inserted = await reldb.sql.execute('INSERT INTO entries (name) VALUES (?)', ['same'])
    expect(inserted.success).toBe(true)
    const duplicate = await reldb.sql.execute('INSERT INTO entries (name) VALUES (?)', ['same'])
    expect(duplicate).toMatchObject({
      success: false,
      error: { code: HaiReldbError.DUPLICATE_ENTRY.code },
    })
    const missing = await reldb.sql.execute('INSERT INTO entries (name) VALUES (?)', [null])
    expect(missing).toMatchObject({
      success: false,
      error: {
        code: HaiReldbError.QUERY_FAILED.code,
        cause: { code: 'SQLITE_CONSTRAINT_NOTNULL' },
      },
    })
    expect(await reldb.sql.query('SELECT name FROM entries')).toEqual({
      success: true,
      data: [
        { name: 'same' },
      ],
    })
  })
})
