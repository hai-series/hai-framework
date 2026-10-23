import type { ListOptions } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { fork } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'
import { defineStorageSuite, localStorageEnv } from './helpers/storage-test-suite.js'

/** 只比较可见逻辑条目；files 与 commonPrefixes 分开存放，但共享页大小。 */
function keys(files: Array<{ key: string }>, commonPrefixes: string[]): string[] {
  return [...files.map(file => file.key), ...commonPrefixes]
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
}

defineStorageSuite('local-cursor', localStorageEnv, () => {
  it('empty and exact pages have no continuation, and partial string prefixes match filenames', async () => {
    const empty = await storage.dir.list({ prefix: 'empty/', maxKeys: 1 })
    expect(empty.success && empty.data).toMatchObject({ files: [], commonPrefixes: [], isTruncated: false })
    expect(empty).not.toHaveProperty('data.nextContinuationToken')
    for (const key of ['partial/a-one.txt', 'partial/a-two.txt', 'partial/b.txt'])
      expect((await storage.file.put(key, key)).success).toBe(true)
    const exact = await storage.dir.list({ prefix: 'partial/a-', maxKeys: 2 })
    expect(exact.success).toBe(true)
    if (!exact.success)
      return
    expect(exact.data.files.map(file => file.key)).toEqual(['partial/a-one.txt', 'partial/a-two.txt'])
    expect(exact.data.isTruncated).toBe(false)
    expect(exact.data.nextContinuationToken).toBeUndefined()
  })

  it('orders UTF-8 keys stably across files and directory traversal, and survives module reinitialization', async () => {
    const expected = ['order/a.txt', 'order/a/child.txt', 'order/a0.txt', 'order/z.txt', 'order/中.txt', 'order/\uE000.txt', 'order/😀.txt']
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    for (const key of [...expected].reverse())
      expect((await storage.file.put(key, key)).success).toBe(true)
    const config = storage.config!
    const received: string[] = []
    let token: string | undefined
    for (let page = 0; page < expected.length; page++) {
      const listed = await storage.dir.list({ prefix: 'order/', maxKeys: 2, continuationToken: token })
      expect(listed.success).toBe(true)
      if (!listed.success)
        return
      received.push(...listed.data.files.map(file => file.key))
      expect(listed.data.files.length).toBeLessThanOrEqual(2)
      if (!listed.data.isTruncated) {
        expect(listed.data.nextContinuationToken).toBeUndefined()
        break
      }
      expect(listed.data.nextContinuationToken).toBeTypeOf('string')
      expect(listed.data.nextContinuationToken).not.toBe(token)
      token = listed.data.nextContinuationToken
      expect((await storage.close()).success).toBe(true)
      expect((await storage.init(config)).success).toBe(true)
    }
    expect(received).toEqual(expected)
  })

  it('counts files and delimiter groups together, does not emit empty directories or internal files, and groups non-slash delimiters', async () => {
    const root = storage.config
    if (!root || root.type !== 'local')
      throw new Error('Expected local fixture')
    for (const key of ['mixed/a.txt', 'mixed/b/1.txt', 'mixed/b/2.txt', 'mixed/c.txt', 'mixed/d/1.txt'])
      expect((await storage.file.put(key, key)).success).toBe(true)
    await mkdir(join(root.root, 'mixed', 'empty'), { recursive: true })
    await writeFile(join(root.root, 'mixed', 'hidden.meta.json'), '{}')
    await writeFile(join(root.root, 'mixed', 'hidden.upload.tmp'), 'pending')
    const expected = ['mixed/a.txt', 'mixed/b/', 'mixed/c.txt', 'mixed/d/']
    const received: string[] = []
    let token: string | undefined
    for (let page = 0; page < 4; page++) {
      const result = await storage.dir.list({ prefix: 'mixed/', delimiter: '/', maxKeys: 1, continuationToken: token })
      expect(result.success).toBe(true)
      if (!result.success)
        return
      const visible = keys(result.data.files, result.data.commonPrefixes)
      expect(visible).toHaveLength(1)
      received.push(...visible)
      token = result.data.nextContinuationToken
      expect(result.data.isTruncated).toBe(page < 3)
    }
    expect(received).toEqual(expected)
    expect(token).toBeUndefined()
    for (const key of ['groups/key--a.txt', 'groups/key--b.txt', 'groups/key2.txt'])
      expect((await storage.file.put(key, key)).success).toBe(true)
    const grouped = await storage.dir.list({ prefix: 'groups/', delimiter: '--' })
    expect(grouped.success).toBe(true)
    if (grouped.success) {
      expect(grouped.data.commonPrefixes).toEqual(['groups/key--'])
      expect(grouped.data.files.map(file => file.key)).toEqual(['groups/key2.txt'])
    }
  })

  it('binds continuation to root, prefix and delimiter, validates token shape, and permits a different next-page size', async () => {
    for (const key of ['scope/a.txt', 'scope/b.txt', 'scope/c.txt'])
      expect((await storage.file.put(key, key)).success).toBe(true)
    const first = await storage.dir.list({ prefix: 'scope/', maxKeys: 1 })
    expect(first.success).toBe(true)
    if (!first.success)
      return
    const token = first.data.nextContinuationToken!
    const invalid: ListOptions[] = [
      { prefix: 'another/', continuationToken: token },
      { prefix: 'scope/', delimiter: '/', continuationToken: token },
      { prefix: 'scope/', continuationToken: '' },
      { prefix: 'scope/', continuationToken: 'not-json' },
      { prefix: 'scope/', continuationToken: Buffer.from('[2,"scope","a"]').toString('base64url') },
      { prefix: 'scope/', continuationToken: 'a'.repeat(20_000) },
      { prefix: 'scope/', maxKeys: 0 },
      { prefix: 'scope/', maxKeys: -1 },
      { prefix: 'scope/', maxKeys: Number.NaN },
      { prefix: 'scope/', maxKeys: 1.5 },
      { prefix: 'scope/', maxKeys: 1001 },
      { prefix: 'scope/', delimiter: '\uD83D' },
      // @ts-expect-error JavaScript 调用方的显式 null 不能变成无前缀全量查询。
      { prefix: null },
    ]
    for (const options of invalid) {
      const result = await storage.dir.list(options)
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiStorageError.INVALID_LIST_OPTIONS.code)
    }
    const second = await storage.dir.list({ prefix: 'scope/', maxKeys: 10, continuationToken: token })
    expect(second.success && second.data.files.map(file => file.key)).toEqual(['scope/b.txt', 'scope/c.txt'])
    const config = storage.config!
    const other = localStorageEnv()
    try {
      expect((await storage.close()).success).toBe(true)
      expect((await storage.init(other.config)).success).toBe(true)
      const mismatch = await storage.dir.list({ prefix: 'scope/', continuationToken: token })
      expect(mismatch.success).toBe(false)
      if (!mismatch.success)
        expect(mismatch.error.code).toBe(HaiStorageError.INVALID_LIST_OPTIONS.code)
    }
    finally {
      await storage.close()
      await other.cleanup?.()
      expect((await storage.init(config)).success).toBe(true)
    }
  })

  it('continues the same cursor in an independent Node process with no warm provider state', async () => {
    for (const key of ['process/a.txt', 'process/b.txt', 'process/c.txt'])
      expect((await storage.file.put(key, key)).success).toBe(true)
    const first = await storage.dir.list({ prefix: 'process/', maxKeys: 1 })
    expect(first.success).toBe(true)
    if (!first.success)
      return
    const root = storage.config
    if (!root || root.type !== 'local')
      throw new Error('Expected local fixture')
    const worker = fork(new URL('./fixtures/storage-list-node.mjs', import.meta.url), { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    const reply = await new Promise<{ success: boolean, keys?: string[], isTruncated?: boolean }>((resolveReply, reject) => {
      let result: { success: boolean, keys?: string[], isTruncated?: boolean } | undefined
      const timeout = setTimeout(() => worker.kill(), 10000)
      worker.once('message', (message) => {
        result = message as typeof result
      })
      worker.once('error', (error) => {
        clearTimeout(timeout)
        worker.kill()
        reject(error)
      })
      worker.once('exit', (code) => {
        clearTimeout(timeout)
        if (code === 0 && result)
          resolveReply(result)
        else
          reject(new Error('Storage cursor worker failed'))
      })
      worker.send({ root: root.root, options: { prefix: 'process/', maxKeys: 2, continuationToken: first.data.nextContinuationToken } })
    })
    expect(reply).toEqual({ success: true, keys: ['process/b.txt', 'process/c.txt'], isTruncated: false })
  })
})
