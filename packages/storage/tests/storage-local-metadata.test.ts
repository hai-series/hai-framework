import { mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import * as fileSystem from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    unlink: vi.fn(original.unlink),
  }
})

let root: string
beforeEach(async () => {
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(unlink).mockReset().mockImplementation(original.unlink)
  root = await mkdtemp(join(tmpdir(), 'hai-storage-metadata-'))
  expect((await storage.init({ type: 'local', root })).success).toBe(true)
})
afterEach(async () => {
  await storage.close()
  await rm(root, { recursive: true, force: true })
})

it('unknown filesystem failures retain the full IO error definition and a safe public message', async () => {
  expect((await storage.file.put('report.txt', 'content')).success).toBe(true)
  const failed = vi.spyOn(fileSystem, 'stat').mockRejectedValueOnce(Object.assign(new Error('Fixture private filesystem diagnostic'), { code: 'EIO' }))
  try {
    const result = await storage.file.head('report.txt')
    expect(result).toMatchObject({ success: false, error: HaiStorageError.IO_ERROR })
    if (!result.success)
      expect(result.error.message).not.toContain('Fixture private filesystem diagnostic')
  }
  finally {
    failed.mockRestore()
  }
})

it('metadata preparation failure does not publish or overwrite content', async () => {
  await writeFile(join(root, 'report.txt'), 'legacy content')
  await writeFile(join(root, 'report.txt.meta.json'), JSON.stringify({
    contentType: 'text/plain',
    metadata: { owner: 'legacy' },
  }))
  await writeFile(join(root, '.hai-storage-meta'), 'blocked metadata directory')
  const result = await storage.file.put('report.txt', 'new content', {
    metadata: { owner: 'new' },
  })
  expect(result.success).toBe(false)
  expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('legacy content')
  expect(await readFile(join(root, 'report.txt.meta.json'), 'utf8')).toBe(JSON.stringify({
    contentType: 'text/plain',
    metadata: { owner: 'legacy' },
  }))
  expect((await storage.file.put('new.txt', 'new', { ifNoneMatch: '*' })).success).toBe(false)
  expect(await storage.file.exists('new.txt')).toEqual({ success: true, data: false })
})

it('requires the current generation record and never inherits a legacy sidecar', async () => {
  await writeFile(join(root, 'report.txt'), 'legacy')
  await writeFile(join(root, 'report.txt.meta.json'), JSON.stringify({
    contentType: 'text/html',
    metadata: { owner: 'legacy' },
  }))
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: false,
    error: { code: HaiStorageError.OPERATION_FAILED.code },
  })
  expect((await storage.file.put('report.txt', 'new')).success).toBe(true)
  // 模拟保留的旧旁车文件；新版本必须读取当前代际的显式空记录。
  await writeFile(join(root, 'report.txt.meta.json'), JSON.stringify({
    contentType: 'text/html',
    metadata: { owner: 'legacy' },
  }))
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: true,
    data: { contentType: 'text/plain', metadata: undefined },
  })
})

it.each(['{"secret":"metadata-secret-sentinel",', '{"metadata":{"secret":123}}', 'null'])('invalid records fail safely without returning their contents: %s', async (record) => {
  expect((await storage.file.put('report.txt', 'content')).success).toBe(true)
  const [name] = await readdir(join(root, '.hai-storage-meta'))
  await writeFile(join(root, '.hai-storage-meta', name!), record)
  const result = await storage.file.head('report.txt')
  expect(result).toMatchObject({
    success: false,
    error: { code: HaiStorageError.OPERATION_FAILED.code },
  })
  expect(JSON.stringify(result)).not.toContain('metadata-secret-sentinel')
})

it.each(['file.meta.json/child.txt', 'file.upload.tmp/child.txt', '.hai-storage-meta/child.txt'])('rejects internal metadata namespaces in every path segment: %s', async (key) => {
  for (const result of [await storage.file.put(key, 'blocked'), await storage.file.get(key), await storage.dir.delete(key)]) {
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiStorageError.INVALID_PATH.code)
  }
})

it.each([false, true])('concurrent writes keep content and metadata together without rolling back another writer (conditional=%s)', async (conditional) => {
  let release: () => void = () => {}
  let started: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const writingStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  async function* delayed() {
    started()
    await pending
    yield new TextEncoder().encode('first')
  }
  const first = storage.file.put('shared.txt', delayed(), {
    metadata: { writer: 'first' },
    ...(conditional
      ? { ifNoneMatch: '*' as const }
      : {}),
  })
  await writingStarted
  try {
    expect((await storage.file.put('shared.txt', 'second', {
      metadata: { writer: 'second' },
    })).success).toBe(true)
  }
  finally {
    release()
  }
  const result = await first
  expect(result.success).toBe(!conditional)
  if (!result.success)
    expect(result.error.code).toBe(HaiStorageError.ALREADY_EXISTS.code)
  const expected = conditional ? 'second' : 'first'
  const content = await storage.file.get('shared.txt')
  expect(content.success).toBe(true)
  if (content.success)
    expect(content.data.toString()).toBe(expected)
  expect(await storage.file.head('shared.txt')).toMatchObject({
    success: true,
    data: {
      metadata: { writer: expected },
    },
  })
  expect(await storage.dir.list()).toMatchObject({
    success: true,
    data: {
      files: [
        { key: 'shared.txt' },
      ],
    },
  })
})

it('cancelled preparation preserves the previous generation and removes only the current temporary files', async () => {
  expect((await storage.file.put('report.txt', 'previous', {
    metadata: { writer: 'previous' },
  })).success).toBe(true)
  const before = (await readdir(root, { recursive: true })).sort()
  const controller = new AbortController()
  async function* cancelled() {
    controller.abort()
    yield new TextEncoder().encode('cancelled')
  }
  const result = await storage.file.put('report.txt', cancelled(), {
    signal: controller.signal,
    metadata: { writer: 'cancelled' },
  })
  expect(result.success).toBe(false)
  expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('previous')
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: true,
    data: {
      metadata: { writer: 'previous' },
    },
  })
  expect((await readdir(root, { recursive: true })).sort()).toEqual(before)
})

it('a failed cleanup of an observed old generation cannot turn a committed write into failure', async () => {
  expect((await storage.file.put('report.txt', 'old', {
    metadata: { writer: 'old' },
  })).success).toBe(true)
  const oldRecords = await readdir(join(root, '.hai-storage-meta'))
  expect(oldRecords).toHaveLength(1)
  const oldRecord = join(root, '.hai-storage-meta', oldRecords[0]!)
  const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(unlink).mockImplementation(async (path) => {
    if (String(path) === oldRecord)
      throw Object.assign(new Error('Fixture cleanup denied'), { code: 'EACCES' })
    return original.unlink(path)
  })
  expect((await storage.file.put('report.txt', 'new', {
    metadata: { writer: 'new' },
  })).success).toBe(true)
  expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('new')
  expect(await storage.file.head('report.txt')).toMatchObject({
    success: true,
    data: {
      metadata: { writer: 'new' },
    },
  })
  expect((await readdir(join(root, '.hai-storage-meta')))).toContain(oldRecords[0])
})
